/** Shared, lazily created data sources for effects. */
import { AudioService } from "./audio.js";
import { NowPlayingService } from "./mpris.js";
import { StatsService } from "./stats.js";

export { AudioService, NowPlayingService, StatsService };
export type { NowPlaying } from "./mpris.js";
export type { SystemStats } from "./stats.js";

/** Lazily constructs each service on first use and disposes them together. */
export class Services {
  private audioSvc: AudioService | null = null;
  private npSvc: NowPlayingService | null = null;
  private statsSvc: StatsService | null = null;

  audio(): AudioService {
    return (this.audioSvc ??= new AudioService());
  }

  nowPlaying(): NowPlayingService {
    return (this.npSvc ??= new NowPlayingService());
  }

  stats(): StatsService {
    return (this.statsSvc ??= new StatsService());
  }

  /** Stop all started services. */
  dispose(): void {
    this.audioSvc?.dispose();
    this.npSvc?.dispose();
    this.statsSvc?.dispose();
    this.audioSvc = this.npSvc = this.statsSvc = null;
  }
}
