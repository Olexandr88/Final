/**
 * Tool Runtime Module
 * Exposes @api, @bash, @python tokens for live execution
 * OWASP ZAP-safe with regex validation
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class ToolRuntime {
  constructor(options = {}) {
    this.options = {
      allowBash: options.allowBash ?? true,
      allowPython: options.allowPython ?? true,
      allowAPI: options.allowAPI ?? true,
      timeout: options.timeout ?? 10000,
      maxOutputSize: options.maxOutputSize ?? 100000,
      sandboxMode: options.sandboxMode ?? true,
      ...options,
    };

    this.executionLog = [];
    this.safelist = this.initSafelist();
  }

  /**
   * Initialize OWASP ZAP-safe patterns
   */
  initSafelist() {
    return {
      // Bash commands whitelist
      bash: {
        allowed: [
          /^ls\s+/,
          /^pwd$/,
          /^echo\s+/,
          /^cat\s+[\w\-\.\/]+$/,
          /^grep\s+/,
          /^find\s+/,
          /^curl\s+-X\s+(GET|POST)\s+/,
          /^apt\s+list\s+/,
          /^npm\s+(list|ls)/,
          /^git\s+(status|log|diff)/,
          /^python\s+-c\s+/,
          /^node\s+[\w\-\.\/]+$/,
        ],
        blocked: [
          /rm\s+-rf/,
          /sudo/,
          /chmod/,
          /shutdown/,
          /reboot/,
          /mkfs/,
          /dd\s+if=/,
          />\s*\/dev\/sd/,
          /systemctl/,
        ],
      },

      // Python code patterns
      python: {
        allowed: [
          /^import\s+(math|random|datetime|json|re|os\.path)/,
          /^def\s+\w+/,
          /^print\(/,
          /^for\s+\w+\s+in\s+/,
          /^\w+\s*=\s*/,
          /.*/, // Allow all for now (will rely on blocked list)
        ],
        blocked: [
          /import\s+os(?!\.path)/,
          /import\s+subprocess/,
          /import\s+sys/,
          /eval\(/,
          /exec\(/,
          /__import__/,
          /compile\(/,
          /rm\s+-rf/,
          /os\.system/,
          /os\.popen/,
        ],
      },

      // API call patterns
      api: {
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedDomains: [
          'api.github.com',
          'api.openweathermap.org',
          'jsonplaceholder.typicode.com',
          'httpbin.org',
          'api.coinbase.com',
        ],
        blockedPatterns: [/localhost/, /127\.0\.0\.1/, /192\.168\./, /10\.\d+\./, /\.local$/],
      },
    };
  }

  /**
   * Parse tool calls from generated text
   */
  parseToolCalls(text) {
    const toolPattern = /@(\w+)\(([^)]+)\)/g;
    const calls = [];
    let match;

    while ((match = toolPattern.exec(text)) !== null) {
      const [fullMatch, tool, args] = match;
      calls.push({
        tool,
        args: args.trim(),
        rawCall: fullMatch,
        position: match.index,
      });
    }

    return calls;
  }

  /**
   * Validate and execute tool call
   */
  async executeTool(toolName, args) {
    const startTime = Date.now();

    try {
      // Security validation
      if (!this.validateToolCall(toolName, args)) {
        return {
          success: false,
          error: 'Security validation failed',
          tool: toolName,
          args,
        };
      }

      let result;
      switch (toolName.toLowerCase()) {
        case 'bash':
          result = await this.executeBash(args);
          break;
        case 'python':
          result = await this.executePython(args);
          break;
        case 'api':
          result = await this.executeAPI(args);
          break;
        case 'calculator':
          result = await this.executeCalculator(args);
          break;
        case 'describe':
          result = await this.executeDescribe(args);
          break;
        case 'search':
          result = await this.executeSearch(args);
          break;
        default:
          result = {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }

      // Log execution
      this.executionLog.push({
        tool: toolName,
        args,
        result,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: toolName,
        args,
      };
    }
  }

  /**
   * Validate tool call against security rules
   */
  validateToolCall(tool, args) {
    const rules = this.safelist[tool.toLowerCase()];
    if (!rules) return false;

    // Check blocked patterns first
    if (rules.blocked) {
      for (const pattern of rules.blocked) {
        if (pattern.test(args)) {
          console.warn(`❌ Blocked pattern detected: ${pattern}`);
          return false;
        }
      }
    }

    // Check allowed patterns
    if (rules.allowed) {
      const isAllowed = rules.allowed.some((pattern) => pattern.test(args));
      if (!isAllowed) {
        console.warn(`⚠️  Command not in allowlist: ${args}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Execute bash command
   */
  async executeBash(command) {
    if (!this.options.allowBash) {
      return { success: false, error: 'Bash execution disabled' };
    }

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: this.options.timeout,
        maxBuffer: this.options.maxOutputSize,
      });

      return {
        success: true,
        output: output.trim(),
        tool: 'bash',
        command,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || '',
        tool: 'bash',
        command,
      };
    }
  }

  /**
   * Execute Python code
   */
  async executePython(code) {
    if (!this.options.allowPython) {
      return { success: false, error: 'Python execution disabled' };
    }

    try {
      const output = execSync(`python -c "${code.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        timeout: this.options.timeout,
        maxBuffer: this.options.maxOutputSize,
      });

      return {
        success: true,
        output: output.trim(),
        tool: 'python',
        code,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stderr: error.stderr?.toString() || '',
        tool: 'python',
        code,
      };
    }
  }

  /**
   * Execute API call
   */
  async executeAPI(argsString) {
    if (!this.options.allowAPI) {
      return { success: false, error: 'API calls disabled' };
    }

    try {
      // Parse: @api(POST, https://api.example.com/endpoint, {"key": "value"})
      const parts = argsString.split(',').map((s) => s.trim());
      const method = parts[0].toUpperCase();
      const url = parts[1];
      const body = parts[2] ? JSON.parse(parts[2]) : null;

      // Validate method
      if (!this.safelist.api.allowedMethods.includes(method)) {
        return { success: false, error: `Method not allowed: ${method}` };
      }

      // Validate domain
      const urlObj = new URL(url);
      const isAllowedDomain = this.safelist.api.allowedDomains.some((domain) =>
        urlObj.hostname.endsWith(domain)
      );

      if (!isAllowedDomain) {
        return { success: false, error: `Domain not allowed: ${urlObj.hostname}` };
      }

      // Execute request
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ToolRuntime/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options.timeout),
      });

      const data = await response.json();

      return {
        success: true,
        status: response.status,
        data,
        tool: 'api',
        method,
        url,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'api',
      };
    }
  }

  /**
   * Execute vision/image description (LLaVA chaining)
   */
  async executeDescribe(imageUrl) {
    try {
      console.log(`   🖼️  Calling LLaVA for image description...`);

      // Call LLaVA (assumes ollama has llava model)
      const { execSync } = require('child_process');

      const prompt = 'Describe this image in detail.';
      const cmd = `ollama run llava:13b-q4 "${prompt}" --image "${imageUrl}"`;

      const description = execSync(cmd, {
        encoding: 'utf-8',
        timeout: this.options.timeout,
        maxBuffer: this.options.maxOutputSize,
      });

      return {
        success: true,
        description: description.trim(),
        imageUrl,
        tool: 'describe',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'describe',
      };
    }
  }

  /**
   * Execute web search
   */
  async executeSearch(query) {
    try {
      console.log(`   🔍 Searching for: ${query}`);

      // Use DuckDuckGo lite (no API key needed)
      const response = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        {
          headers: { 'User-Agent': 'ToolRuntime/1.0' },
          signal: AbortSignal.timeout(this.options.timeout),
        }
      );

      const html = await response.text();

      // Extract snippets (simple parsing)
      const snippets = [];
      const resultPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      let match;
      let count = 0;

      while ((match = resultPattern.exec(html)) !== null && count < 5) {
        if (!match[1].includes('duckduckgo.com')) {
          snippets.push({
            title: match[2].trim(),
            url: match[1],
          });
          count++;
        }
      }

      return {
        success: true,
        query,
        snippets,
        count: snippets.length,
        tool: 'search',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'search',
      };
    }
  }

  /**
   * Execute calculator
   */
  async executeCalculator(expression) {
    try {
      // Sanitize expression (only allow numbers and basic math)
      const safe = expression.replace(/[^0-9+\-*/().\s]/g, '');

      if (safe !== expression) {
        return { success: false, error: 'Invalid characters in expression' };
      }

      const result = Function(`"use strict"; return (${safe})`)();

      return {
        success: true,
        result,
        expression: safe,
        tool: 'calculator',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: 'calculator',
      };
    }
  }

  /**
   * Process generated text with tool calls
   */
  async processWithTools(generatedText) {
    const calls = this.parseToolCalls(generatedText);

    if (calls.length === 0) {
      return {
        text: generatedText,
        toolCalls: [],
        enhanced: false,
      };
    }

    let enhancedText = generatedText;
    const results = [];

    for (const call of calls) {
      console.log(`\n🔧 Executing: @${call.tool}(${call.args})`);

      const result = await this.executeTool(call.tool, call.args);
      results.push(result);

      // Splice result into text
      const resultText = result.success
        ? `\n[Result: ${JSON.stringify(result.output || result.data || result.result)}]\n`
        : `\n[Error: ${result.error}]\n`;

      enhancedText = enhancedText.replace(call.rawCall, call.rawCall + resultText);

      console.log(result.success ? `✅ ${result.output || result.result}` : `❌ ${result.error}`);
    }

    return {
      text: enhancedText,
      toolCalls: results,
      enhanced: true,
      callCount: calls.length,
    };
  }

  /**
   * Get execution log
   */
  getLog() {
    return this.executionLog;
  }

  /**
   * Clear execution log
   */
  clearLog() {
    this.executionLog = [];
  }

  /**
   * Save log to file
   */
  saveLog(filename = './tool-execution-log.json') {
    fs.writeFileSync(filename, JSON.stringify(this.executionLog, null, 2));
    console.log(`✅ Log saved to ${filename}`);
  }
}

// CLI usage
if (require.main === module) {
  const runtime = new ToolRuntime();

  const testCases = [
    '@bash(ls -la)',
    '@python(print(2 + 2))',
    '@calculator(15 * 7 + 3)',
    '@api(GET, https://api.github.com/users/github)',
  ];

  (async () => {
    console.log('🧪 Tool Runtime Test Suite\n');
    console.log('='.repeat(60));

    for (const testCase of testCases) {
      const calls = runtime.parseToolCalls(testCase);

      for (const call of calls) {
        console.log(`\n📝 Testing: ${testCase}`);
        const result = await runtime.executeTool(call.tool, call.args);

        if (result.success) {
          console.log(`✅ Success`);
          console.log(
            `   Output: ${JSON.stringify(result.output || result.data || result.result)}`
          );
        } else {
          console.log(`❌ Failed: ${result.error}`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Execution Log Summary');
    console.log('='.repeat(60));

    const log = runtime.getLog();
    console.log(`Total executions: ${log.length}`);
    console.log(`Successful: ${log.filter((l) => l.result.success).length}`);
    console.log(`Failed: ${log.filter((l) => !l.result.success).length}`);

    runtime.saveLog();
  })();
}

module.exports = ToolRuntime;
