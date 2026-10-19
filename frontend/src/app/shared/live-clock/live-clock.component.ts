import { Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-live-clock',
  templateUrl: './live-clock.component.html',
})
export class LiveClockComponent implements OnInit, OnDestroy {
  clockTime = '';
  clockDate = '';
  private interval: any;

  ngOnInit(): void {
    this.tick();
    this.interval = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private tick(): void {
    const now = new Date();
    this.clockTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
    this.clockDate = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
}
