"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Archive, BookOpen, Plus } from "lucide-react";
import { AreaIcon } from "@/components/area-icon";
import { AreaDialog } from "@/components/study/area-dialog";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress, Skeleton } from "@/components/ui/misc";
import { formatDuration } from "@/lib/time";
import type { GoalsOverview, StudyAreaListItem } from "@/lib/types";

export default function StudyPage() {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <StudyInner />
    </Suspense>
  );
}

function StudyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const { data: areas, error, isLoading, mutate } = useSWR<StudyAreaListItem[]>(showArchived ? "/api/study-areas?archived=1" : "/api/study-areas");
  const { data: goals } = useSWR<GoalsOverview>("/api/goals");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (params.get("new") === "1") {
      setOpen(true);
      router.replace("/study");
    }
  }, [params, router]);

  const weekly = new Map((goals?.goals ?? []).filter((g) => g.type === "SUBJECT_WEEKLY").map((g) => [g.studyAreaId, g]));
  const list = (areas ?? []).filter((a) => (showArchived ? true : !a.archivedAt));

  return (
    <div>
      <PageHeader
        title="Study"
        description="Your subjects, their tasks and resources, and every minute you've put in."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              <Archive /> {showArchived ? "Hide archived" : "Show archived"}
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus /> New study area
            </Button>
          </>
        }
      />
      {error && <ErrorNotice onRetry={() => mutate()} />}
      {isLoading ? (
        <GridSkeleton />
      ) : !list.length ? (
        <EmptyState
          icon={BookOpen}
          title="No study areas yet."
          body="Create your first study area and start tracking your progress."
          action={<Button onClick={() => setOpen(true)}><Plus /> Create study area</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a, i) => {
            const g = weekly.get(a.id);
            const taskPct = a.taskCount ? Math.round((a.tasksDone / a.taskCount) * 100) : 0;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                <Link href={`/study/${a.id}`} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="flex h-full flex-col p-5 transition-colors hover:border-foreground/20">
                    <div className="flex items-start gap-3">
                      <AreaIcon icon={a.icon} color={a.color} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold tracking-tight">{a.name}</p>
                        <p className="line-clamp-2 text-[13px] text-muted-foreground">{a.description || "No description"}</p>
                      </div>
                      {a.archivedAt && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">Archived</span>}
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[12px] text-muted-foreground">Total time</p>
                        <p className="tnum text-[18px] font-semibold tracking-tight">{formatDuration(a.totalSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-[12px] text-muted-foreground">Tasks</p>
                        <p className="tnum text-[18px] font-semibold tracking-tight">
                          {a.tasksDone}<span className="text-[14px] font-normal text-muted-foreground"> / {a.taskCount}</span>
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto space-y-3 pt-5">
                      <div>
                        <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground"><span>Task progress</span><span className="tnum">{taskPct}%</span></div>
                        <Progress value={taskPct} color={a.color} />
                      </div>
                      {g && (
                        <div>
                          <div className="mb-1.5 flex justify-between text-[12px] text-muted-foreground">
                            <span>This week</span>
                            <span className="tnum">{formatDuration(g.progressSec)} / {formatDuration(g.targetMinutes * 60)}</span>
                          </div>
                          <Progress value={g.percent} color={a.color} />
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
      <AreaDialog open={open} onOpenChange={setOpen} onSaved={(a) => { mutate(); router.push(`/study/${a.id}`); }} />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
    </div>
  );
}
