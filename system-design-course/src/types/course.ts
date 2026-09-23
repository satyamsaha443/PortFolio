export type AudienceLevel = "beginner" | "pro" | "senior";
export type ModuleId = `module-${number}`;

export interface LearningObjective {
  text: string;
  level: AudienceLevel;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface Assignment {
  beginner: string;
  pro: string;
  senior: string;
}

export interface FurtherReading {
  title: string;
  url: string;
  description: string;
}

export interface Diagram {
  tool: "mermaid" | "excalidraw" | "drawio";
  description: string;
  source: string;
}

export interface Lesson {
  id: string;
  title: string;
  slug: string;
  audienceLevels: AudienceLevel[];
  estimatedMinutes: number;
  objectives: LearningObjective[];
  contentFile: string;
  diagram?: Diagram;
  quiz: QuizQuestion[];
  assignment: Assignment;
  furtherReading: FurtherReading[];
  tags: string[];
}

export interface Module {
  id: ModuleId;
  number: number;
  title: string;
  description: string;
  audienceLevels: AudienceLevel[];
  estimatedHours: number;
  lessons: Lesson[];
}

export interface Course {
  title: string;
  version: string;
  lastUpdated: string;
  modules: Module[];
}

export interface CapacityEstimate {
  dau: number;
  mau: number;
  qpsRead: number;
  qpsWrite: number;
  storageGB: number;
  bandwidthGbps: number;
  assumptions: string[];
}

export interface TradeOff {
  decision: string;
  pros: string[];
  cons: string[];
  recommendation: string;
}

export interface SystemDesign {
  id: string;
  title: string;
  realWorldExample: string;
  difficulty: AudienceLevel;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  capacity: CapacityEstimate;
  apiEndpoints: ApiEndpoint[];
  databaseSchema: TableSchema[];
  tradeOffs: TradeOff[];
  bottlenecks: Bottleneck[];
  interviewCheatSheet: string[];
}

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  requestBody?: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  statusCodes: Record<number, string>;
  rateLimit?: string;
}

export interface TableSchema {
  tableName: string;
  columns: Column[];
  indexes: Index[];
  partitionKey?: string;
  notes?: string;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
}

export interface Index {
  name: string;
  columns: string[];
  type: "btree" | "hash" | "gin" | "gist";
  unique: boolean;
}

export interface Bottleneck {
  component: string;
  problem: string;
  solution: string;
  tradeOff: string;
}
