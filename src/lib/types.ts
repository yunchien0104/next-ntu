export type ProductPage =
  | "coach"
  | "calendar"
  | "columns"
  | "talent"
  | "resume";

export type Theme = "dark" | "light";

export interface TodoItem {
  id: string;
  title: string;
  due: string;
  tag: string;
  done: boolean;
  urgent?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  guests: string;
  notes: string;
  type?: "career" | "shared" | "";
}

export interface Post {
  id: string;
  category: string;
  initials: string;
  author: string;
  meta: string;
  title: string;
  copy: string;
  likes: number;
  liked?: boolean;
  saved?: boolean;
}

export interface Talent {
  id: string;
  initials: string;
  name: string;
  meta: string;
  field: string;
  level: string;
  gender: string;
  bio: string;
  tags: string[];
  response: "active" | "later";
  roleModel?: boolean;
}

export type ResumeSectionType =
  | "experience"
  | "education"
  | "skills";

export interface ResumeEntry {
  organization: string;
  location: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ResumeSection {
  id: string;
  title: string;
  type: ResumeSectionType;
  entries: ResumeEntry[];
}

export interface ResumeData {
  profile: {
    fullName: string;
    cityCountry: string;
    phone: string;
    email: string;
    linkedIn: string;
  };
  sections: ResumeSection[];
}