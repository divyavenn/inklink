export interface Chapter {
  id: string;
  workId: string;
  slug: string;
  title: string;
  filePath: string;
  sortOrder: number;
  createdAt: string;
  lineCount?: number;
}
