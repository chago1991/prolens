/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/** Sent by a cluster frame with `(clusterId, title)` when the view it shows changes. */
export const clusterTabTitleChannel = "prolens:cluster-tab-title";

/** Sent by the root frame when it wants every cluster frame to report its title again. */
export const clusterTabTitleRequestChannel = "prolens:cluster-tab-title-request";
