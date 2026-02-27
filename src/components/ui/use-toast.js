"use client";
import * as React from "react";
const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000;
const toastTimeouts = new Map();
const addToRemoveQueue = (toastId) => {
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
const toastInitialState = {
    toasts: []
};
const TOAST_ADD = "ADD_TOAST";
const TOAST_DISMISS = "DISMISS_TOAST";
const TOAST_REMOVE = "REMOVE_TOAST";
const toastReducer = (state, action) => {
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
            }
            else {
                state.toasts.forEach((toast) => {
                    addToRemoveQueue(toast.id);
                });
            }
            return {
                ...state,
                toasts: state.toasts.map((toast) => toast.id === toastId || toastId === undefined
                    ? { ...toast }
                    : toast)
            };
        }
        case TOAST_REMOVE: {
            return {
                ...state,
                toasts: state.toasts.filter((toast) => toast.id !== action.toastId && action.toastId !== undefined)
            };
        }
    }
};
const listeners = [];
let memoryState = toastInitialState;
function dispatch(action) {
    memoryState = toastReducer(memoryState, action);
    listeners.forEach((listener) => {
        listener(memoryState);
    });
}
function toast(toast) {
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
        dismiss: () => dispatch({
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
        dismiss: (toastId) => dispatch({ type: TOAST_DISMISS, toastId })
    };
}
export { useToast, toast };
