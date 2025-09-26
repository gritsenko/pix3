import type { OperationCommit } from './Operation';

export class BulkOperationBuilder {
	private commits: OperationCommit[] = [];

	get size(): number {
		return this.commits.length;
	}

	isEmpty(): boolean {
		return this.commits.length === 0;
	}

	add(commit: OperationCommit): void {
		this.commits.push(commit);
	}

	clear(): void {
		this.commits = [];
	}

	build(label?: string): OperationCommit {
		if (!this.commits.length) {
			throw new Error('Cannot build a bulk operation without commits.');
		}

		const commits = [...this.commits];
		const first = commits[0];
		const last = commits[commits.length - 1];

		return {
			label: label ?? last.label ?? first.label,
			beforeSnapshot: first.beforeSnapshot,
			afterSnapshot: last.afterSnapshot,
			undo: async () => {
				for (const commit of [...commits].reverse()) {
					await commit.undo();
				}
			},
			redo: async () => {
				for (const commit of commits) {
					await commit.redo();
				}
			},
		};
	}
}
