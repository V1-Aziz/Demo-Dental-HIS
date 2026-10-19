import { exec } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';
import { getReceptionistStats, getInventoryDashboardStats, getAdminDashboardStats } from '../repositories/dashboard.repository';

const execAsync = promisify(exec);

export async function receptionistStatsService() {
  return getReceptionistStats();
}

export async function inventoryDashboardStatsService() {
  return getInventoryDashboardStats();
}

export async function adminDashboardStatsService() {
  return getAdminDashboardStats();
}

function sampleCpuTimes() {
  return os.cpus().map(c => ({
    idle: c.times.idle,
    total: Object.values(c.times).reduce((a, b) => a + b, 0),
  }));
}

// CPU "usage" is a rate, not a level — we have to sample cumulative tick
// counters twice and diff them. 200ms is the smallest window that still
// gives a stable number without making the admin dashboard feel slow.
async function getCpuUsage(): Promise<{ usedPercent: number; coreCount: number; speedMHz: number }> {
  const sample1 = sampleCpuTimes();
  await new Promise(r => setTimeout(r, 200));
  const sample2 = sampleCpuTimes();

  let totalIdle = 0;
  let totalTick = 0;
  sample1.forEach((s1, i) => {
    totalIdle += sample2[i].idle - s1.idle;
    totalTick += sample2[i].total - s1.total;
  });

  const usedPercent = totalTick > 0 ? Math.round(100 - (100 * totalIdle / totalTick)) : 0;
  return {
    usedPercent: Math.max(0, Math.min(100, usedPercent)),
    coreCount: os.cpus().length,
    speedMHz: os.cpus()[0]?.speed ?? 0,
  };
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  return {
    usedPercent: Math.round((used / total) * 100),
    totalGB: parseFloat((total / 1024 ** 3).toFixed(1)),
    usedGB:  parseFloat((used  / 1024 ** 3).toFixed(1)),
  };
}

// Node has no built-in disk-usage API, so we shell out. PowerShell on Windows
// and `df` on POSIX give us total/free bytes for the root volume. Any failure
// (missing shell, timeout, parse error) returns the zero fallback — the
// dashboard must never crash because we couldn't read a disk stat.
async function getDiskUsage(): Promise<{ usedPercent: number; totalGB: number; freeGB: number }> {
  const fallback = { usedPercent: 0, totalGB: 0, freeGB: 0 };
  try {
    if (process.platform === 'win32') {
      const cmd = `powershell -NoProfile -Command "Get-PSDrive C | Select-Object @{N='Free';E={$_.Free}},@{N='Used';E={$_.Used}} | ConvertTo-Json"`;
      const { stdout } = await execAsync(cmd, { timeout: 6000 });
      const parsed = JSON.parse(stdout.trim());
      const free  = Number(parsed.Free);
      const used  = Number(parsed.Used);
      const total = free + used;
      if (total > 0) {
        return {
          usedPercent: Math.round((used / total) * 100),
          totalGB: parseFloat((total / 1024 ** 3).toFixed(1)),
          freeGB:  parseFloat((free  / 1024 ** 3).toFixed(1)),
        };
      }
    } else {
      const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3}'", { timeout: 5000 });
      const [total, used] = stdout.trim().split(' ').map(Number);
      if (total > 0) {
        return {
          usedPercent: Math.round((used / total) * 100),
          totalGB: parseFloat((total / 1024 ** 3).toFixed(1)),
          freeGB:  parseFloat(((total - used) / 1024 ** 3).toFixed(1)),
        };
      }
    }
  } catch { /* fallthrough */ }
  return fallback;
}

export async function systemPerformanceService() {
  const [cpu, disk] = await Promise.all([getCpuUsage(), getDiskUsage()]);
  return {
    cpu,
    memory: getMemoryUsage(),
    disk,
    timestamp: new Date().toISOString(),
  };
}
