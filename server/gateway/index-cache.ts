import type { FeedName } from "../../shared/feed";
import {
  mergeIndexHistory,
  mergeIndexTick,
  type IndexCode,
  type IndexPoint,
  type IndexSnapshot,
} from "../../shared/indexes";

// Chỉ số theo nguồn: ảnh chụp mới nhất và chuỗi điểm theo phút cho biểu đồ.
// Dùng cùng hàm ghép điểm với kho chỉ số ở trình duyệt, nên hai bên vẽ ra một đường.
interface Track {
  snapshot: IndexSnapshot | null;
  points: IndexPoint[];
}

export class IndexCache {
  private readonly feeds = new Map<FeedName, Map<IndexCode, Track>>();

  private track(feed: FeedName, code: IndexCode): Track {
    const tracks = this.feeds.get(feed) ?? new Map<IndexCode, Track>();
    this.feeds.set(feed, tracks);
    const track = tracks.get(code) ?? { snapshot: null, points: [] };
    tracks.set(code, track);
    return track;
  }

  setSnapshot(feed: FeedName, snapshot: IndexSnapshot): void {
    const track = this.track(feed, snapshot.code);
    const added = track.snapshot ? snapshot.volume - track.snapshot.volume : 0;
    track.points = mergeIndexTick(track.points, snapshot, added);
    track.snapshot = snapshot;
  }

  setHistory(feed: FeedName, code: IndexCode, history: IndexPoint[]): void {
    const track = this.track(feed, code);
    track.points = mergeIndexHistory(history, track.points);
  }

  snapshots(feed: FeedName): IndexSnapshot[] {
    return [...(this.feeds.get(feed)?.values() ?? [])]
      .map((track) => track.snapshot)
      .filter((snapshot): snapshot is IndexSnapshot => snapshot !== null);
  }

  history(feed: FeedName, code: string): IndexPoint[] | undefined {
    return this.feeds.get(feed)?.get(code as IndexCode)?.points;
  }
}
