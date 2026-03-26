export type QueryParamSpec = {
  name: string;
  required?: boolean;
  description: string;
};

export type BodySchema = {
  name: string;
  description: string;
  example?: unknown;
};

export type Operation = {
  id: string;
  service: "attachmentservice" | "memoservice" | "activityservice";
  title: string;
  summary: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  pathParams: string[];
  queryParams: QueryParamSpec[];
  bodySchema?: BodySchema;
};

const memoBodyExample = {
  state: "NORMAL",
  content: "#memos\n\nHello from Memos",
  visibility: "PRIVATE",
};

const attachmentBodyExample = {
  filename: "demo.txt",
  type: "text/plain",
  content: "<base64-bytes>",
  memo: "memos/123",
};

export const OPERATIONS: Operation[] = [
  {
    id: "AttachmentService_ListAttachments",
    service: "attachmentservice",
    title: "List Attachments",
    summary: "List attachments with pagination, filtering, and ordering.",
    method: "GET",
    path: "/attachments",
    pathParams: [],
    queryParams: [
      { name: "pageSize", description: "Maximum number of attachments to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
      { name: "filter", description: "Filter such as mime_type==\"image/png\" or filename.contains(\"test\")." },
      { name: "orderBy", description: "Ordering such as create_time desc or filename asc." },
    ],
  },
  {
    id: "AttachmentService_CreateAttachment",
    service: "attachmentservice",
    title: "Create Attachment",
    summary: "Create a new attachment from an Attachment JSON body.",
    method: "POST",
    path: "/attachments",
    pathParams: [],
    queryParams: [
      { name: "attachmentId", description: "Optional explicit attachment id." },
    ],
    bodySchema: {
      name: "Attachment",
      description: "Attachment body with filename, type, and base64-encoded content.",
      example: attachmentBodyExample,
    },
  },
  {
    id: "AttachmentService_GetAttachment",
    service: "attachmentservice",
    title: "Get Attachment",
    summary: "Fetch one attachment by id.",
    method: "GET",
    path: "/attachments/{attachment}",
    pathParams: ["attachment"],
    queryParams: [],
  },
  {
    id: "AttachmentService_UpdateAttachment",
    service: "attachmentservice",
    title: "Update Attachment",
    summary: "Patch an attachment. updateMask is required.",
    method: "PATCH",
    path: "/attachments/{attachment}",
    pathParams: ["attachment"],
    queryParams: [
      { name: "updateMask", required: true, description: "Comma-separated list of attachment fields to update." },
    ],
    bodySchema: {
      name: "Attachment",
      description: "Attachment fields to update.",
      example: {
        filename: "renamed.txt",
        externalLink: "https://example.com/demo.txt",
      },
    },
  },
  {
    id: "AttachmentService_DeleteAttachment",
    service: "attachmentservice",
    title: "Delete Attachment",
    summary: "Delete an attachment by id.",
    method: "DELETE",
    path: "/attachments/{attachment}",
    pathParams: ["attachment"],
    queryParams: [],
  },
  {
    id: "MemoService_ListMemos",
    service: "memoservice",
    title: "List Memos",
    summary: "List memos with pagination and filters.",
    method: "GET",
    path: "/memos",
    pathParams: [],
    queryParams: [
      { name: "pageSize", description: "Maximum number of memos to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
      { name: "state", description: "Memo state such as NORMAL or ARCHIVED." },
      { name: "orderBy", description: "Ordering such as display_time desc." },
      { name: "filter", description: "CEL-style memo filter." },
      { name: "showDeleted", description: "Set true to show deleted memos." },
    ],
  },
  {
    id: "MemoService_CreateMemo",
    service: "memoservice",
    title: "Create Memo",
    summary: "Create a new memo from a Memo body.",
    method: "POST",
    path: "/memos",
    pathParams: [],
    queryParams: [
      { name: "memoId", description: "Optional explicit memo id." },
    ],
    bodySchema: {
      name: "Memo",
      description: "Memo with required state, content, and visibility. Put hashtags directly into content when you want Memos to extract tags.",
      example: memoBodyExample,
    },
  },
  {
    id: "MemoService_GetMemo",
    service: "memoservice",
    title: "Get Memo",
    summary: "Fetch one memo by id.",
    method: "GET",
    path: "/memos/{memo}",
    pathParams: ["memo"],
    queryParams: [],
  },
  {
    id: "MemoService_UpdateMemo",
    service: "memoservice",
    title: "Update Memo",
    summary: "Patch a memo. updateMask is required.",
    method: "PATCH",
    path: "/memos/{memo}",
    pathParams: ["memo"],
    queryParams: [
      { name: "updateMask", required: true, description: "Comma-separated list of memo fields to update." },
    ],
    bodySchema: {
      name: "Memo",
      description: "Memo fields to update.",
      example: {
        content: "Updated content",
        visibility: "PROTECTED",
      },
    },
  },
  {
    id: "MemoService_DeleteMemo",
    service: "memoservice",
    title: "Delete Memo",
    summary: "Delete a memo by id. force is optional.",
    method: "DELETE",
    path: "/memos/{memo}",
    pathParams: ["memo"],
    queryParams: [
      { name: "force", description: "Force delete even when the memo has associated data." },
    ],
  },
  {
    id: "MemoService_ListMemoAttachments",
    service: "memoservice",
    title: "List Memo Attachments",
    summary: "List attachments linked to a memo.",
    method: "GET",
    path: "/memos/{memo}/attachments",
    pathParams: ["memo"],
    queryParams: [
      { name: "pageSize", description: "Maximum number of attachments to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
    ],
  },
  {
    id: "MemoService_SetMemoAttachments",
    service: "memoservice",
    title: "Set Memo Attachments",
    summary: "Replace the memo attachment set.",
    method: "PATCH",
    path: "/memos/{memo}/attachments",
    pathParams: ["memo"],
    queryParams: [],
    bodySchema: {
      name: "SetMemoAttachmentsRequest",
      description: "Body with memo resource name and attachment references.",
      example: {
        name: "memos/123",
        attachments: [{ name: "attachments/abc" }],
      },
    },
  },
  {
    id: "MemoService_ListMemoComments",
    service: "memoservice",
    title: "List Memo Comments",
    summary: "List comment memos for one memo.",
    method: "GET",
    path: "/memos/{memo}/comments",
    pathParams: ["memo"],
    queryParams: [
      { name: "pageSize", description: "Maximum number of comments to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
      { name: "orderBy", description: "Ordering expression for comments." },
    ],
  },
  {
    id: "MemoService_CreateMemoComment",
    service: "memoservice",
    title: "Create Memo Comment",
    summary: "Create a comment memo for one memo.",
    method: "POST",
    path: "/memos/{memo}/comments",
    pathParams: ["memo"],
    queryParams: [
      { name: "commentId", description: "Optional explicit comment id." },
    ],
    bodySchema: {
      name: "Memo",
      description: "Comment memo body.",
      example: {
        state: "NORMAL",
        content: "This is a comment",
        visibility: "PRIVATE",
      },
    },
  },
  {
    id: "MemoService_ListMemoReactions",
    service: "memoservice",
    title: "List Memo Reactions",
    summary: "List reactions for one memo.",
    method: "GET",
    path: "/memos/{memo}/reactions",
    pathParams: ["memo"],
    queryParams: [
      { name: "pageSize", description: "Maximum number of reactions to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
    ],
  },
  {
    id: "MemoService_UpsertMemoReaction",
    service: "memoservice",
    title: "Upsert Memo Reaction",
    summary: "Create or replace one reaction on a memo.",
    method: "POST",
    path: "/memos/{memo}/reactions",
    pathParams: ["memo"],
    queryParams: [],
    bodySchema: {
      name: "UpsertMemoReactionRequest",
      description: "Body with memo resource name and reaction payload.",
      example: {
        name: "memos/123",
        reaction: {
          contentId: "memos/123",
          reactionType: "👍",
        },
      },
    },
  },
  {
    id: "MemoService_DeleteMemoReaction",
    service: "memoservice",
    title: "Delete Memo Reaction",
    summary: "Delete one reaction from a memo.",
    method: "DELETE",
    path: "/memos/{memo}/reactions/{reaction}",
    pathParams: ["memo", "reaction"],
    queryParams: [],
  },
  {
    id: "MemoService_ListMemoRelations",
    service: "memoservice",
    title: "List Memo Relations",
    summary: "List memo relations for one memo.",
    method: "GET",
    path: "/memos/{memo}/relations",
    pathParams: ["memo"],
    queryParams: [
      { name: "pageSize", description: "Maximum number of relations to return." },
      { name: "pageToken", description: "Opaque token for the next page." },
    ],
  },
  {
    id: "MemoService_SetMemoRelations",
    service: "memoservice",
    title: "Set Memo Relations",
    summary: "Replace the relation set for a memo.",
    method: "PATCH",
    path: "/memos/{memo}/relations",
    pathParams: ["memo"],
    queryParams: [],
    bodySchema: {
      name: "SetMemoRelationsRequest",
      description: "Body with memo resource name and relation entries.",
      example: {
        name: "memos/123",
        relations: [
          {
            memo: { name: "memos/123" },
            relatedMemo: { name: "memos/456" },
            type: "REFERENCE",
          },
        ],
      },
    },
  },
  {
    id: "ActivityService_ListActivities",
    service: "activityservice",
    title: "List Activities",
    summary: "List activities. The docs page confirms the endpoint and method, but server versions may differ.",
    method: "GET",
    path: "/activities",
    pathParams: [],
    queryParams: [],
  },
  {
    id: "ActivityService_GetActivity",
    service: "activityservice",
    title: "Get Activity",
    summary: "Fetch one activity by id.",
    method: "GET",
    path: "/activities/{activity}",
    pathParams: ["activity"],
    queryParams: [],
  },
];

export const OPERATIONS_BY_ID = new Map(OPERATIONS.map((operation) => [operation.id, operation]));
