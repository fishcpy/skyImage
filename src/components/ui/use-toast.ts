"use client";

import * as React from "react";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000;

type ToasterToast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
};

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

type State = {
  toasts: ToasterToast[];
};

const toastInitialState: State = {
  toasts: []
};

const TOAST_ADD = "ADD_TOAST";
const TOAST_DISMISS = "DISMISS_TOAST";
const TOAST_REMOVE = "REMOVE_TOAST";

type ToastAction =
  | {
      type: typeof TOAST_ADD;
      toast: ToasterToast;
    }
  | {
      type: typeof TOAST_DISMISS;
      toastId?: string;
    }
  | {
      type: typeof TOAST_REMOVE;
      toastId?: string;
    };

const toastReducer = (state: State, action: ToastAction): State => {
  switch (action.type) {
    case TOAST_ADD: {
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT)
      };
    }

    case TOAST_DISMISS: {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === toastId || toastId === undefined
            ? { ...toast }
            : toast
        )
      };
    }

    case TOAST_REMOVE: {
      return {
        ...state,
        toasts: state.toasts.filter(
          (toast) => toast.id !== action.toastId && action.toastId !== undefined
        )
      };
    }
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState = toastInitialState;

function dispatch(action: ToastAction) {
  memoryState = toastReducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id">;

function toast(toast: Toast) {
  const id = crypto.randomUUID();

  dispatch({
    type: TOAST_ADD,
    toast: {
      ...toast,
      id
    }
  });

  return {
    id,
    dismiss: () =>
      dispatch({
        type: TOAST_DISMISS,
        toastId: id
      })
  };
}

function useToast() {
  const [state, setState] = React.useState(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: TOAST_DISMISS, toastId })
  };
}

export { useToast, toast };
