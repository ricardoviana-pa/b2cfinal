declare module 'prerender-node' {
  import { RequestHandler } from 'express';
  interface PrerenderNode extends RequestHandler {
    set(key: string, value: string): PrerenderNode;
  }
  const prerender: PrerenderNode;
  export default prerender;
}
