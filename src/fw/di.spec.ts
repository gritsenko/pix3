import { describe, expect, it } from 'vitest';
import { inject, injectable, ServiceContainer } from './di';

describe('ServiceContainer', () => {
  it('creates distinct tokens for different constructors even if names match', () => {
    const container = ServiceContainer.getInstance();
    const FirstService = class MinifiedService {};
    const SecondService = class MinifiedService {};

    const firstToken = container.getOrCreateToken(FirstService);
    const secondToken = container.getOrCreateToken(SecondService);

    expect(firstToken).not.toBe(secondToken);
  });

  it('reuses the same token for the same constructor', () => {
    const container = ServiceContainer.getInstance();
    class StableService {}

    expect(container.getOrCreateToken(StableService)).toBe(
      container.getOrCreateToken(StableService)
    );
  });

  it('injects the correct service when constructors share the same name', () => {
    const FirstService = class MinifiedService {
      readonly kind = 'first';
    };
    const SecondService = class MinifiedService {
      readonly kind = 'second';
    };

    injectable()(FirstService);
    injectable()(SecondService);

    class Consumer {
      @inject(FirstService)
      declare first: InstanceType<typeof FirstService>;

      @inject(SecondService)
      declare second: InstanceType<typeof SecondService>;
    }

    const consumer = new Consumer();

    expect(consumer.first.kind).toBe('first');
    expect(consumer.second.kind).toBe('second');
    expect(consumer.first).not.toBe(consumer.second);
  });
});
