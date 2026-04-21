import { describe, it, expect, beforeAll } from 'vitest';
import { CodeParser } from '../services/ingestion/parser.ts';

describe('CodeParser', () => {
  let parser: CodeParser;

  beforeAll(async () => {
    parser = new CodeParser();
    await parser.initialize();
  });

  it('should extract class and method definitions with metadata', () => {
    const code = `
      class TestScanner {
        /**
         * Scans a directory for symbols.
         * TODO: Add support for more languages.
         */
        public scan(dir: string, depth: number = 5): Promise<void> {
          this.parser.parse(dir);
          return Promise.resolve();
        }
      }
    `;
    const symbols = parser.parse(code, 'typescript');
    
    expect(symbols).toContainEqual(expect.objectContaining({
      name: 'TestScanner',
      kind: 'class'
    }));
    
    expect(symbols).toContainEqual(expect.objectContaining({
      name: 'scan',
      kind: 'method',
      inputs: ['dir: string', 'depth: number = 5'],
      outputs: ['Promise<void>'],
      calls: ['parse', 'resolve']
    }));
  });

  it('should extract function declarations from JavaScript with inferred types', () => {
    const code = `
      function helloWorld(name) {
        console.log("Hello " + name);
        return "Greeting sent";
      }
    `;
    const symbols = parser.parse(code, 'javascript');
    
    expect(symbols).toContainEqual(expect.objectContaining({
      name: 'helloWorld',
      kind: 'function',
      inputs: ['name'],
      outputs: ['inferred_dynamic_type'],
      calls: ['log']
    }));
  });

  it('should handle arrow functions and variables', () => {
    const code = `
      const add = (a: number, b: number): number => a + b;
    `;
    const symbols = parser.parse(code, 'typescript');

    expect(symbols).toContainEqual(expect.objectContaining({
      name: 'add',
      kind: 'function',
      inputs: ['a: number', 'b: number'],
      outputs: ['number']
    }));
  });

  it('should attribute calls inside an arrow function body to the named variable, not to anonymous', () => {
    // Regression: the visitor re-enters the arrow_function node as a child of the
    // lexical_declaration and previously pushed an 'anonymous' symbol onto the stack,
    // displacing 'fetchData'. Calls inside the body were then attributed to 'anonymous'
    // and lost when anonymous symbols were filtered out.
    const code = `
      const fetchData = async (url: string) => {
        const result = await fetch(url);
        return parseResponse(result);
      };
    `;
    const symbols = parser.parse(code, 'typescript');

    const fetchData = symbols.find(s => s.name === 'fetchData');
    expect(fetchData).toBeDefined();
    expect(fetchData?.calls).toContain('fetch');
    expect(fetchData?.calls).toContain('parseResponse');

    // No anonymous symbols should survive the filter
    expect(symbols.find(s => s.name === 'anonymous')).toBeUndefined();
  });

  it('should extract class inheritance (extends)', () => {
    const code = `
      class Animal {
        move() { return "moving"; }
      }
      class Dog extends Animal {
        bark() { return "woof"; }
      }
    `;
    const symbols = parser.parse(code, 'typescript');

    const dog = symbols.find(s => s.name === 'Dog');
    expect(dog).toBeDefined();
    expect(dog?.extends).toBe('Animal');
  });

  it('should extract interface implementation (implements)', () => {
    const code = `
      interface Runnable {
        run(): void;
      }
      interface Stoppable {
        stop(): void;
      }
      class Service implements Runnable, Stoppable {
        run() {}
        stop() {}
      }
    `;
    const symbols = parser.parse(code, 'typescript');

    const service = symbols.find(s => s.name === 'Service');
    expect(service).toBeDefined();
    expect(service?.implements).toContain('Runnable');
    expect(service?.implements).toContain('Stoppable');
  });

  it('should extract combined extends and implements', () => {
    const code = `
      class BaseController {}
      interface Loggable {}
      class UserController extends BaseController implements Loggable {
        getUser() {}
      }
    `;
    const symbols = parser.parse(code, 'typescript');

    const controller = symbols.find(s => s.name === 'UserController');
    expect(controller).toBeDefined();
    expect(controller?.extends).toBe('BaseController');
    expect(controller?.implements).toContain('Loggable');
  });

  it('should extract Python class inheritance', () => {
    const code = `
class Animal:
    def move(self):
        pass

class Dog(Animal):
    def bark(self):
        pass
    `;
    const symbols = parser.parse(code, 'python');

    const dog = symbols.find(s => s.name === 'Dog');
    expect(dog).toBeDefined();
    expect(dog?.extends).toBe('Animal');
  });
});
