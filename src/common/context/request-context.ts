import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
}

const requestContextStorage =
  new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext(
  context: RequestContext,
  callback: () => void,
): void {
  requestContextStorage.run(
    context,
    callback,
  );
}

export function getRequestContext():
  | RequestContext
  | undefined {
  return requestContextStorage.getStore();
}
