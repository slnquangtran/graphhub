import { ObservationService } from './observation-service.ts';

const BUGFIX_TAG = 'bugfix-pattern';
const SKILL_TAG = 'skill-routing';

export interface BugfixPattern {
  id: string;
  symptom: string;
  root_cause: string;
  fix: string;
  related_symbols: string[];
  tags: string[];
  timestamp: string;
  similarity?: number;
}

export interface SkillChoice {
  id: string;
  task_description: string;
  skill_path: string;
  outcome: 'success' | 'partial' | 'failed' | 'unknown';
  tags: string[];
  timestamp: string;
  similarity?: number;
}

export interface RememberBugfixOptions {
  symptom: string;
  root_cause: string;
  fix: string;
  related_symbols?: string[];
  project?: string;
  session_id?: string;
  tags?: string[];
}

export interface RememberSkillChoiceOptions {
  task_description: string;
  skill_path: string;
  outcome?: 'success' | 'partial' | 'failed';
  project?: string;
  session_id?: string;
  tags?: string[];
}

export interface RecallOptions {
  limit?: number;
  project?: string;
}

export class PatternMemoryService {
  private static instance: PatternMemoryService;
  private observations: ObservationService;

  private constructor() {
    this.observations = ObservationService.getInstance();
  }

  public static getInstance(): PatternMemoryService {
    if (!PatternMemoryService.instance) {
      PatternMemoryService.instance = new PatternMemoryService();
    }
    return PatternMemoryService.instance;
  }

  public formatBugfixContent(symptom: string, root_cause: string, fix: string): string {
    return `SYMPTOM: ${symptom}\nROOT CAUSE: ${root_cause}\nFIX: ${fix}`;
  }

  public formatSkillContent(task: string, skill: string, outcome: string): string {
    return `TASK: ${task}\nCHOSEN SKILL: ${skill}\nOUTCOME: ${outcome}`;
  }

  public async rememberBugfix(opts: RememberBugfixOptions): Promise<string> {
    const content = this.formatBugfixContent(opts.symptom, opts.root_cause, opts.fix);
    const tags = Array.from(new Set([BUGFIX_TAG, ...(opts.tags ?? [])]));
    return this.observations.remember(content, {
      type: 'bugfix',
      title: opts.symptom.slice(0, 60),
      related_symbols: opts.related_symbols,
      project: opts.project,
      session_id: opts.session_id,
      tags,
      importance: 'high',
    });
  }

  public async recallBugfix(symptom: string, options: RecallOptions = {}): Promise<BugfixPattern[]> {
    const rows = await this.observations.recall(symptom, {
      type: 'bugfix',
      tags: [BUGFIX_TAG],
      limit: options.limit ?? 5,
      project: options.project,
    });
    return rows.map((r: any) => ({
      id: r.id,
      ...this.parseBugfixContent(r.content),
      related_symbols: r.related_symbols ?? [],
      tags: r.tags ?? [],
      timestamp: r.timestamp,
      similarity: r.similarity,
    }));
  }

  public async rememberSkillChoice(opts: RememberSkillChoiceOptions): Promise<string> {
    const outcome = opts.outcome ?? 'unknown';
    const content = this.formatSkillContent(opts.task_description, opts.skill_path, outcome);
    const tags = Array.from(new Set([SKILL_TAG, `outcome:${outcome}`, ...(opts.tags ?? [])]));
    return this.observations.remember(content, {
      type: 'decision',
      title: opts.task_description.slice(0, 60),
      file_paths: [opts.skill_path],
      project: opts.project,
      session_id: opts.session_id,
      tags,
      importance: outcome === 'success' ? 'high' : 'medium',
    });
  }

  public async recallSkillChoice(task_description: string, options: RecallOptions = {}): Promise<SkillChoice[]> {
    const rows = await this.observations.recall(task_description, {
      type: 'decision',
      tags: [SKILL_TAG],
      limit: options.limit ?? 5,
      project: options.project,
    });
    return rows.map((r: any) => {
      const parsed = this.parseSkillContent(r.content);
      const outcome = this.extractOutcome(r.tags ?? []) ?? parsed.outcome;
      return {
        id: r.id,
        task_description: parsed.task_description,
        skill_path: parsed.skill_path || (r.file_paths?.[0] ?? ''),
        outcome,
        tags: r.tags ?? [],
        timestamp: r.timestamp,
        similarity: r.similarity,
      };
    });
  }

  public parseBugfixContent(content: string): { symptom: string; root_cause: string; fix: string } {
    const pick = (label: string): string => {
      const match = content.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`));
      return match ? match[1].trim() : '';
    };
    return {
      symptom: pick('SYMPTOM'),
      root_cause: pick('ROOT CAUSE'),
      fix: pick('FIX'),
    };
  }

  public parseSkillContent(content: string): { task_description: string; skill_path: string; outcome: SkillChoice['outcome'] } {
    const pick = (label: string): string => {
      const match = content.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`));
      return match ? match[1].trim() : '';
    };
    const rawOutcome = pick('OUTCOME').toLowerCase();
    const outcome = (['success', 'partial', 'failed', 'unknown'].includes(rawOutcome)
      ? rawOutcome
      : 'unknown') as SkillChoice['outcome'];
    return {
      task_description: pick('TASK'),
      skill_path: pick('CHOSEN SKILL'),
      outcome,
    };
  }

  private extractOutcome(tags: string[]): SkillChoice['outcome'] | null {
    for (const t of tags) {
      if (t.startsWith('outcome:')) {
        const v = t.slice('outcome:'.length);
        if (v === 'success' || v === 'partial' || v === 'failed' || v === 'unknown') return v;
      }
    }
    return null;
  }
}
