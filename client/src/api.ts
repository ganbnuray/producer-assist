const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Script {
  id: string;
  title: string;
  raw_pdf_path: string;
  created_at: string;
}

export interface Scene {
  id: string;
  script_id: string;
  scene_number: string;
  heading: string;
  text_content: string;
  order_index: number;
}

export interface Comment {
  id: string;
  script_id: string;
  scene_id: string;
  start_offset: number;
  end_offset: number;
  highlighted_text: string;
  note_text: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface ProfileField {
  id: string;
  character_id: string;
  field_name: string;
  field_value: string;
  source_anchor_id: string | null;
  anchor_text: string | null;
  anchor_scene_id: string | null;
}

export interface Character {
  id: string;
  script_id: string;
  name: string;
  image_url: string | null;
  video_url: string | null;
  fields: ProfileField[];
}

export interface EditLog {
  id: string;
  script_id: string;
  entity_type: string;
  entity_id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
}

export interface ValueConflict {
  id: string;
  character_id: string;
  field_id: string;
  scene_id: string;
  conflicting_text: string;
  reasoning: string;
}

export const api = {
  scripts: {
    list: () => request<Script[]>("/scripts"),
    get: (id: string) => request<Script>(`/scripts/${id}`),
    upload: (file: File, title: string) => {
      const form = new FormData();
      form.append("pdf", file);
      form.append("title", title);
      return fetch(BASE + "/scripts/upload", { method: "POST", body: form }).then((r) => r.json());
    },
    extractCharacters: (id: string) =>
      request<Array<{ id: string; name: string }>>(`/scripts/${id}/extract-characters`, { method: "POST" }),
    delete: (id: string) => request<void>(`/scripts/${id}`, { method: "DELETE" }),
  },
  scenes: {
    forScript: (scriptId: string) => request<Scene[]>(`/scenes/script/${scriptId}`),
  },
  comments: {
    forScript: (scriptId: string) => request<Comment[]>(`/comments/script/${scriptId}`),
    create: (data: {
      script_id: string;
      scene_id: string;
      start_offset: number;
      end_offset: number;
      highlighted_text: string;
      note_text: string;
      author_id: string;
    }) => request<Comment>("/comments", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/comments/${id}`, { method: "DELETE" }),
  },
  characters: {
    forScript: (scriptId: string) => request<Character[]>(`/characters/script/${scriptId}`),
    get: (id: string) => request<Character>(`/characters/${id}`),
    updateField: (
      charId: string,
      fieldId: string,
      field_value: string,
      author_id: string
    ) =>
      request<{ field: ProfileField; scriptUpdate: unknown }>(`/characters/${charId}/fields/${fieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ field_value, author_id }),
      }),
    generateImage: (id: string) =>
      request<{ image_url: string }>(`/characters/${id}/generate-image`, { method: "POST" }),
    generateVideo: (id: string) =>
      request<{ video_url: string }>(`/characters/${id}/generate-video`, { method: "POST" }),
    conflicts: (id: string) => request<ValueConflict[]>(`/characters/${id}/conflicts`),
  },
  history: {
    forScript: (scriptId: string) => request<EditLog[]>(`/history/script/${scriptId}`),
    revert: (logId: string, author_id: string) =>
      request<{ reverted: boolean }>(`/history/${logId}/revert`, {
        method: "POST",
        body: JSON.stringify({ author_id }),
      }),
  },
  users: {
    list: () => request<User[]>("/users"),
  },
};
