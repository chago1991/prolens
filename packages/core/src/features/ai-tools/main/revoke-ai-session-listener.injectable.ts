/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getRequestChannelListenerInjectable } from "@freelensapp/messaging";
import { revokeAiSessionChannel } from "../common/ai-tools";
import aiSessionsInjectable from "./ai-sessions.injectable";

const revokeAiSessionListenerInjectable = getRequestChannelListenerInjectable({
  id: "revoke-ai-session-listener",
  channel: revokeAiSessionChannel,
  getHandler: (di) => {
    const sessions = di.inject(aiSessionsInjectable);

    return (sessionId) => {
      if (typeof sessionId === "string") {
        sessions.revoke(sessionId);
      }
    };
  },
});

export default revokeAiSessionListenerInjectable;
