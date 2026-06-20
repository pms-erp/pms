// src/lib/events.ts
export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  status?: string;
  [key: string]: unknown;
}

export const taskEvents = {
  onTaskCreated: (callback: (task: Task) => void) => {
    const handler = (event: CustomEvent<Task>) => callback(event.detail);
    window.addEventListener("taskCreated", handler as EventListener);
    return () =>
      window.removeEventListener("taskCreated", handler as EventListener);
  },
  onTaskUpdated: (callback: (task: Task) => void) => {
    const handler = (event: CustomEvent<Task>) => callback(event.detail);
    window.addEventListener("taskUpdated", handler as EventListener);
    return () =>
      window.removeEventListener("taskUpdated", handler as EventListener);
  },
  onTaskAssigned: (callback: (task: Task) => void) => {
    const handler = (event: CustomEvent<Task>) => callback(event.detail);
    window.addEventListener("taskAssigned", handler as EventListener);
    return () =>
      window.removeEventListener("taskAssigned", handler as EventListener);
  },
  triggerTaskCreated: (task: Task) =>
    window.dispatchEvent(
      new CustomEvent<Task>("taskCreated", { detail: task }),
    ),
  triggerTaskUpdated: (task: Task) =>
    window.dispatchEvent(
      new CustomEvent<Task>("taskUpdated", { detail: task }),
    ),
  triggerTaskAssigned: (task: Task) =>
    window.dispatchEvent(
      new CustomEvent<Task>("taskAssigned", { detail: task }),
    ),
};

// Notification events — optional `type` lets listeners filter (e.g. "TASK_ASSIGNED")
export const notificationEvents = {
  onNotificationReceived: (callback: (type?: string) => void) => {
    const handler = (event: Event) => {
      const type = (event as CustomEvent<string | undefined>).detail;
      callback(type);
    };
    window.addEventListener("notificationReceived", handler as EventListener);
    return () =>
      window.removeEventListener(
        "notificationReceived",
        handler as EventListener,
      );
  },
  triggerNotificationReceived: (type?: string) => {
    window.dispatchEvent(
      new CustomEvent<string | undefined>("notificationReceived", {
        detail: type,
      }),
    );
  },
};

export const projectEvents = {
  onProjectCreated: (callback: () => void) => {
    const handler = () => callback();
    window.addEventListener("projectCreated", handler as EventListener);
    return () =>
      window.removeEventListener("projectCreated", handler as EventListener);
  },
  triggerProjectCreated: () => {
    window.dispatchEvent(new CustomEvent("projectCreated"));
  },

  onProjectDeleted: (callback: () => void) => {
    const handler = () => callback();
    window.addEventListener("projectDeleted", handler as EventListener);
    return () =>
      window.removeEventListener("projectDeleted", handler as EventListener);
  },
  triggerProjectDeleted: () => {
    window.dispatchEvent(new CustomEvent("projectDeleted"));
  },
};

// Comment events — fires when a comment is posted so other open tabs refresh
export const commentEvents = {
  onCommentPosted: (callback: (taskId: string) => void) => {
    const handler = (e: Event) => callback((e as CustomEvent<string>).detail);
    window.addEventListener("commentPosted", handler as EventListener);
    return () =>
      window.removeEventListener("commentPosted", handler as EventListener);
  },
  triggerCommentPosted: (taskId: string) =>
    window.dispatchEvent(
      new CustomEvent<string>("commentPosted", { detail: taskId }),
    ),
};
