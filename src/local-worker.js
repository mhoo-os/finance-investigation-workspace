import { handleWorkspaceRequest } from './worker.js';

export default {
  fetch(request, env) {
    return handleWorkspaceRequest(request, env, {
      access: 'PUBLIC_SYNTHETIC_READ_ONLY',
      allowSyntheticSeed: false,
    });
  },
};
