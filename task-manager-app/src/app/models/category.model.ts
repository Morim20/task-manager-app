export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  startDate?: Date;
  dueDate?: Date;
  memo?: string;
  links?: { label: string; url: string }[];
  createdAt: string;
  deleted?: boolean;
  order?: number;
  updatedAt?: string;
  color?: string;
} 