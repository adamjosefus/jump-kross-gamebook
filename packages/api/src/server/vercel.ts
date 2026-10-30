import { handlerFromEnv } from './index.ts';
import { toNodeHandler } from './node.ts';

/** Entry of the Vercel function; bundled into `.vercel/output` by `scripts/build-vercel.ts`. */
const { handler } = handlerFromEnv(process.env);

export default toNodeHandler(handler);
