/** Minimal Graph Planner shapes — only the fields this server reads or writes. */
export interface PlannerPlan {
    id: string;
    title?: string;
    owner?: string;
    createdDateTime?: string;
    container?: {
        containerId?: string;
        type?: string;
        url?: string;
    };
    "@odata.etag"?: string;
}
export interface PlannerPlanDetails {
    id: string;
    sharedWith?: Record<string, boolean>;
    /** category1..category25 -> the human label shown in the Planner UI. */
    categoryDescriptions?: Record<string, string | null>;
    "@odata.etag"?: string;
}
export interface PlannerBucket {
    id: string;
    name?: string;
    planId?: string;
    orderHint?: string;
    "@odata.etag"?: string;
}
export interface PlannerAssignment {
    "@odata.type"?: string;
    assignedBy?: {
        user?: {
            id?: string;
            displayName?: string;
        };
    };
    assignedDateTime?: string;
    orderHint?: string;
}
export type PlannerAssignments = Record<string, PlannerAssignment>;
export interface PlannerTask {
    id: string;
    planId?: string;
    bucketId?: string;
    title?: string;
    orderHint?: string;
    assigneePriority?: string;
    percentComplete?: number;
    priority?: number;
    startDateTime?: string | null;
    dueDateTime?: string | null;
    completedDateTime?: string | null;
    createdDateTime?: string;
    hasDescription?: boolean;
    previewType?: string;
    referenceCount?: number;
    checklistItemCount?: number;
    activeChecklistItemCount?: number;
    conversationThreadId?: string | null;
    completedBy?: {
        user?: {
            id?: string;
        };
    };
    createdBy?: {
        user?: {
            id?: string;
        };
    };
    appliedCategories?: Record<string, boolean>;
    assignments?: PlannerAssignments;
    "@odata.etag"?: string;
}
export interface PlannerChecklistItem {
    "@odata.type"?: string;
    title?: string;
    isChecked?: boolean;
    orderHint?: string;
    lastModifiedDateTime?: string;
    lastModifiedBy?: {
        user?: {
            id?: string;
        };
    };
}
export type PlannerChecklist = Record<string, PlannerChecklistItem>;
export interface PlannerExternalReference {
    "@odata.type"?: string;
    alias?: string;
    type?: string;
    previewPriority?: string;
    lastModifiedDateTime?: string;
    lastModifiedBy?: {
        user?: {
            id?: string;
        };
    };
}
export type PlannerReferences = Record<string, PlannerExternalReference>;
export interface PlannerTaskDetails {
    id: string;
    description?: string | null;
    previewType?: string;
    checklist?: PlannerChecklist;
    references?: PlannerReferences;
    "@odata.etag"?: string;
}
/** The merged view a caller gets from planner_get_task — one call, one card. */
export interface PlannerTaskCard {
    id: string;
    title: string | undefined;
    planId: string | undefined;
    planTitle?: string | undefined;
    bucketId: string | undefined;
    bucketName?: string | undefined;
    progress: {
        percentComplete: number;
        label: string;
    };
    priority: {
        value: number | undefined;
        label: string | undefined;
    };
    startDateTime: string | null | undefined;
    dueDateTime: string | null | undefined;
    completedDateTime: string | null | undefined;
    createdDateTime: string | undefined;
    assignees: Array<{
        id: string;
        displayName?: string | undefined;
        userPrincipalName?: string | undefined;
    }>;
    labels: Array<{
        category: string;
        label: string | null;
    }>;
    description: string | null | undefined;
    checklist: Array<{
        id: string;
        title: string | undefined;
        isChecked: boolean;
        orderHint: string | undefined;
    }>;
    checklistSummary: {
        total: number;
        checked: number;
    };
    references: Array<{
        url: string;
        alias: string | undefined;
        type: string | undefined;
    }>;
    conversationThreadId: string | null | undefined;
    /**
     * Not a cache. Reported so a caller can see the read was consistent; every
     * write re-reads and uses a fresh ETag regardless of what is shown here.
     */
    etags: {
        task: string | undefined;
        details: string | undefined;
    };
    notes?: string[];
}
/**
 * A plan-level goal — beta Graph API, see PlannerApi.listGoals for the full
 * caveat. Tasks link back to goals via their own read-only goalIds array.
 */
export interface PlannerGoal {
    id: string;
    title?: string;
    status?: string;
    endDateTime?: string;
    taskIds?: string[];
}
