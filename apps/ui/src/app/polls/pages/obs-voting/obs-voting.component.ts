import { Component, DestroyRef, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MatchPollPublicInfo } from '@ltrc-campo/shared-api-model';
import { PollsPublicService } from '../../services/polls-public.service';
import * as QRCode from 'qrcode';

@Component({
  selector: 'ltrc-obs-voting',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './obs-voting.component.html',
  styleUrl: './obs-voting.component.scss',
})
export class ObsVotingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(PollsPublicService);
  private readonly destroyRef = inject(DestroyRef);

  info = signal<MatchPollPublicInfo | null>(null);
  qrDataUrl = signal<string | null>(null);
  votingUrl = '';
  pollClosed = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    this.votingUrl = `${window.location.origin}/votar/${token}`;

    this.service
      .getInfo(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (info) => {
          this.info.set(info);
          this.pollClosed.set(info.isClosed);
          if (!info.isClosed) {
            this.generateQr();
            this.scheduleStatusCheck(token, info.endsAt);
          }
        },
        error: () => {},
      });
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private generateQr(): void {
    QRCode.toDataURL(this.votingUrl, {
      width: 280,
      margin: 1,
      color: { dark: '#0d1b2a', light: '#f0f4f8' },
    })
      .then((url) => this.qrDataUrl.set(url))
      .catch(() => {});
  }

  private scheduleStatusCheck(token: string, endsAt: Date): void {
    this.timer = setInterval(() => {
      const now = new Date();
      if (now > new Date(endsAt)) {
        this.pollClosed.set(true);
        if (this.timer) clearInterval(this.timer);
      }
    }, 10000);
  }
}
