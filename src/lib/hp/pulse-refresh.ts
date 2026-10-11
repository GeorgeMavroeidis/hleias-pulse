import type { PulseData } from "../hp-api";
import type { Comment, Post } from "../hp-model";
import type { Clock } from "./freshness";
import { contentVisibleToViewer } from "./surface-freshness";

export function recordsById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export function commentsById(comments: Comment[]): Comment[] {
  const ids = new Map<string, Comment>();
  comments.forEach((comment) => {
    if (comment.id) ids.set(comment.id, comment);
  });
  const seen = new Set<string>();
  return comments.flatMap((comment) => {
    if (!comment.id) return [comment];
    if (seen.has(comment.id)) return [];
    seen.add(comment.id);
    return [ids.get(comment.id)!];
  });
}
const commentGroupsById = (groups: Record<string, Comment[]>) =>
  Object.fromEntries(Object.entries(groups).map(([id, comments]) => [id, commentsById(comments)]));

/** Replace public rows with the accepted response; absence can mean moderation. */
export function reconcilePulseData(data: PulseData): PulseData {
  return {
    ...data,
    authors: recordsById(data.authors),
    profiles: recordsById(data.profiles),
    places: recordsById(data.places),
    posts: recordsById(data.posts).map((post) => ({
      ...post,
      comments: commentsById(post.comments),
    })),
    placeComments: commentGroupsById(data.placeComments),
    routeComments: commentGroupsById(data.routeComments),
    culturalEventComments: commentGroupsById(data.culturalEventComments),
    events: recordsById(data.events),
    meetEvents: recordsById(data.meetEvents),
    culturalEvents: recordsById(data.culturalEvents),
    routes: recordsById(data.routes),
    stories: recordsById(data.stories),
  };
}

/** Server publication supersedes a local write acknowledgement with the same ID. */
export function reconcilePosts(local: Post[], accepted: Post[]) {
  return recordsById([...local, ...accepted]);
}

type DetailRecord = {
  id: string;
  moderationStatus?: string | null;
  userId?: string | null;
};

/** Apply viewer scope before rendering, including while a refresh is pending or failed. */
export function visibleDetail<T extends DetailRecord>(
  detail: T | null,
  viewerUserId: string | null,
) {
  return detail && contentVisibleToViewer(detail, viewerUserId) ? detail : null;
}

/** Successful omission closes ordinary details; only permission-checked Saved context may fill a cap. */
export function reconcileOpenDetail<T extends DetailRecord>(
  current: T | null,
  incoming: T[],
  saved: T[],
  viewerUserId: string | null,
): T | null {
  if (!current) return null;
  return visibleDetail(
    incoming.find((row) => row.id === current.id) ??
      saved.find((row) => row.id === current.id) ??
      null,
    viewerUserId,
  );
}

export class PulseRefreshController {
  private generation = 0;
  constructor(
    private readonly load: () => Promise<PulseData>,
    private readonly clock: Clock,
    private readonly callbacks: {
      accepted: (data: PulseData, fetchedAtMs: number) => void;
      failed: (error: unknown) => void;
      aged: (nowMs: number) => void;
    },
  ) {}
  invalidate() {
    this.generation += 1;
  }
  async refresh() {
    const generation = ++this.generation;
    this.callbacks.aged(this.clock.nowMs());
    try {
      const data = await this.load();
      if (generation !== this.generation) return;
      const nowMs = this.clock.nowMs();
      this.callbacks.aged(nowMs);
      this.callbacks.accepted(reconcilePulseData(data), nowMs);
    } catch (error) {
      if (generation !== this.generation) return;
      this.callbacks.aged(this.clock.nowMs());
      this.callbacks.failed(error);
    }
  }
}
