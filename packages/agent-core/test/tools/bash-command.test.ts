/**
 * bash-command 解析器测试（PRD-0031 0a）。
 *
 * 用例种子来自 PR1-0a-spike 基准集（44 条，100% 覆盖），并按生产级修正
 * （grep pattern 位置参数、find 起始目录、cp 读写区分、heredoc/进程替换、
 * env 执行参数等）。三类期望：可收窄（narrow）、合法宽化（broad）、
 * 强制审批（indirect）；解析器从不 throw。
 */
import { describe, expect, it } from 'vitest';

import { hasGlobChars, parseBashCommand } from '../../src/tools/policies/bash-command';

describe('bash-command parse — 单子命令分类', () => {
  it('读动词提取 read 路径（含敏感文件）', () => {
    const r = parseBashCommand('cat .env');
    expect(r.subcommands).toHaveLength(1);
    expect(r.subcommands[0].kind).toBe('narrow');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: '.env', operation: 'read' }]);

    const r2 = parseBashCommand('cat ~/.ssh/id_rsa');
    expect(r2.subcommands[0].paths).toEqual([{ rawPath: '~/.ssh/id_rsa', operation: 'read' }]);
  });

  it('head/tail/ls 的 flag 值不当作路径', () => {
    const r = parseBashCommand('head -n 20 README.md');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: 'README.md', operation: 'read' }]);
    expect(parseBashCommand('ls -la src/').subcommands[0].paths).toEqual([
      { rawPath: 'src/', operation: 'read' },
    ]);
  });

  it('写动词的裸 token 按定义就是路径（rm x 的文件不存在）', () => {
    const r = parseBashCommand('rm x');
    expect(r.subcommands[0].kind).toBe('narrow');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: 'x', operation: 'write' }]);
    expect(parseBashCommand('mkdir -p src/components').subcommands[0].paths).toEqual([
      { rawPath: 'src/components', operation: 'write' },
    ]);
  });

  it('cp 区分读写（源读目标写），mv 全写', () => {
    expect(parseBashCommand('cp src/a.ts dest/b.ts').subcommands[0].paths).toEqual([
      { rawPath: 'src/a.ts', operation: 'read' },
      { rawPath: 'dest/b.ts', operation: 'write' },
    ]);
    expect(parseBashCommand('mv a.txt b.txt').subcommands[0].paths).toEqual([
      { rawPath: 'a.txt', operation: 'write' },
      { rawPath: 'b.txt', operation: 'write' },
    ]);
  });

  it('搜索动词：grep 首个位置参数是 pattern，find 首个位置参数是根目录', () => {
    expect(parseBashCommand('grep -r "TODO" src/').subcommands[0].paths).toEqual([
      { rawPath: 'src/', operation: 'search' },
    ]);
    // `grep "\.env" src/` 的 `.env` 是 pattern 不是路径
    expect(parseBashCommand('grep "\\.env" src/').subcommands[0].paths).toEqual([
      { rawPath: 'src/', operation: 'search' },
    ]);
    // -e 提供 pattern 后位置参数都是文件
    expect(parseBashCommand('grep -e foo file.txt').subcommands[0].paths).toEqual([
      { rawPath: 'file.txt', operation: 'search' },
    ]);
    expect(parseBashCommand('find . -name "*.ts"').subcommands[0].paths).toEqual([
      { rawPath: '.', operation: 'search' },
    ]);
  });

  it('重定向目标作为路径提取，且不与 verb 参数重复计数', () => {
    const r = parseBashCommand('echo "done" > result.txt');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: 'result.txt', operation: 'write' }]);
  });

  it('git 按子命令分类读写；git 整体不可收窄（触碰 .git）', () => {
    const status = parseBashCommand('git status').subcommands[0];
    expect(status.kind).toBe('broad');
    const add = parseBashCommand('git add src/foo.ts').subcommands[0];
    expect(add.kind).toBe('broad');
    expect(add.paths).toEqual([{ rawPath: 'src/foo.ts', operation: 'write' }]);
    // -m 的 value 不是路径
    expect(parseBashCommand('git commit -m "fix"').subcommands[0].paths).toEqual([]);
  });

  it('build/test 动词宽化为 broad（带文件参数也收窄失败——会加载任意依赖）', () => {
    expect(parseBashCommand('bun test').subcommands[0].kind).toBe('broad');
    const withFile = parseBashCommand('bun test test/foo.test.ts').subcommands[0];
    expect(withFile.kind).toBe('broad');
    expect(withFile.paths).toEqual([{ rawPath: 'test/foo.test.ts', operation: 'read' }]);
  });

  it('curl URL 为 broad；curl -o 精确落盘 → narrow write', () => {
    expect(parseBashCommand('curl https://example.com/api').subcommands[0].kind).toBe('broad');
    const o = parseBashCommand('curl -o out.html https://x.com').subcommands[0];
    expect(o.kind).toBe('narrow');
    expect(o.paths).toEqual([{ rawPath: 'out.html', operation: 'write' }]);
  });

  it('网络动词 scp/rsync/ssh → broad', () => {
    expect(parseBashCommand('scp file user@host:/tmp').subcommands[0].kind).toBe('broad');
    expect(parseBashCommand('rsync -avz src/ host:/dest/').subcommands[0].kind).toBe('broad');
  });

  it('解释器：-c/-e 内层代码为已知绕过面 → indirect；脚本文件 → broad', () => {
    expect(parseBashCommand('python -c "print(1+1)"').subcommands[0].kind).toBe('indirect');
    expect(parseBashCommand('node -e "console.log(1)"').subcommands[0].kind).toBe('indirect');
    const script = parseBashCommand('python setup.py').subcommands[0];
    expect(script.kind).toBe('broad');
    expect(script.paths).toEqual([{ rawPath: 'setup.py', operation: 'read' }]);
  });

  it('间接执行（eval/source/./exec/command/xargs）→ indirect', () => {
    for (const cmd of [
      'eval "$CMD"',
      'source ./setup.sh',
      '. ./setup.sh',
      'exec rm x',
      'command -v git',
      'echo hi | xargs rm',
    ]) {
      expect(parseBashCommand(cmd).subcommands.some((s) => s.kind === 'indirect')).toBe(true);
    }
  });

  it('不带 -c 的 sh/bash 执行脚本 → indirect', () => {
    expect(parseBashCommand('bash script.sh').subcommands[0].kind).toBe('indirect');
  });

  it('env 带命令参数时执行该命令 → indirect；纯 env 不触碰文件', () => {
    expect(parseBashCommand('env FOO=1 node script.js').subcommands[0].kind).toBe('indirect');
    expect(parseBashCommand('env').subcommands[0].kind).toBe('no-access');
  });

  it('heredoc 与进程替换 → indirect（无法静态解析）', () => {
    expect(parseBashCommand('cat <<EOF').subcommands[0].kind).toBe('indirect');
    expect(parseBashCommand('cat <(grep x file)').subcommands[0].kind).toBe('indirect');
    expect(parseBashCommand('cat >(grep x file)').subcommands[0].kind).toBe('indirect');
  });

  it('未知动词 → indirect（保守强制审批）', () => {
    expect(parseBashCommand('someobscuretool do thing').subcommands[0].kind).toBe('indirect');
  });

  it('裸 sudo → indirect；sudo 前缀剥壳后按内层动词分类', () => {
    expect(parseBashCommand('sudo').subcommands[0].kind).toBe('indirect');
    const r = parseBashCommand('sudo rm /var/log/syslog');
    expect(r.subcommands[0].verb).toBe('rm');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: '/var/log/syslog', operation: 'write' }]);
  });
});

describe('bash-command parse — 复合命令', () => {
  it('`echo hi; rm x` 中 rm 是独立子命令（PRD-0031 AC）', () => {
    const r = parseBashCommand('echo hi; rm x');
    expect(r.subcommands).toHaveLength(2);
    expect(r.subcommands[0].verb).toBe('echo');
    expect(r.subcommands[0].kind).toBe('no-access');
    expect(r.subcommands[1].verb).toBe('rm');
    expect(r.subcommands[1].paths).toEqual([{ rawPath: 'x', operation: 'write' }]);
  });

  it('; && || | 均在引号外切分；管道两侧独立子命令', () => {
    expect(parseBashCommand('cat file.txt | grep error').subcommands).toHaveLength(2);
    expect(parseBashCommand('bun run build || echo "build failed"').subcommands).toHaveLength(2);
    // `bash -c "a && b"` 的 && 在引号内不切分
    const r = parseBashCommand('bash -c "git status && git log"');
    expect(r.subcommands).toHaveLength(2); // 剥壳后展开为两个叶节点
    expect(r.subcommands.map((s) => s.text)).toEqual(['git status', 'git log']);
  });

  it('bash -c/sh -c 剥壳：内层敏感路径可见', () => {
    const r = parseBashCommand('sh -c "cat .env"');
    expect(r.subcommands).toHaveLength(1);
    expect(r.subcommands[0].paths).toEqual([{ rawPath: '.env', operation: 'read' }]);
  });

  it('cd 记录目标（供 cwd 串行累计），本身不触碰文件', () => {
    const r = parseBashCommand('cd src && cat foo.txt');
    expect(r.subcommands[0].verb).toBe('cd');
    expect(r.subcommands[0].cdTarget).toBe('src');
    expect(r.subcommands[0].kind).toBe('no-access');
    expect(r.subcommands[1].paths).toEqual([{ rawPath: 'foo.txt', operation: 'read' }]);
    // `cd -` / 裸 cd 无目标
    expect(parseBashCommand('cd - && cat .env').subcommands[0].cdTarget).toBeUndefined();
    expect(parseBashCommand('cd && pwd').subcommands[0].cdTarget).toBeUndefined();
  });

  it('env 赋值前缀被剥离后分类', () => {
    const r = parseBashCommand('FOO=1 BAR=2 cat .env');
    expect(r.subcommands[0].verb).toBe('cat');
    expect(r.subcommands[0].paths).toEqual([{ rawPath: '.env', operation: 'read' }]);
  });
});

describe('bash-command parse — review 修复（& / 换行 / find -exec / 深度上限）', () => {
  it('单 & 是命令分隔符：echo hi & rm x 中 rm 是独立子命令', () => {
    const r = parseBashCommand('echo hi & rm x');
    expect(r.subcommands).toHaveLength(2);
    expect(r.subcommands[1].verb).toBe('rm');
    expect(r.subcommands[1].paths).toEqual([{ rawPath: 'x', operation: 'write' }]);
    // 敏感文件裸名不再逃逸
    const r2 = parseBashCommand('echo hi & rm id_rsa');
    expect(r2.subcommands[1].paths).toEqual([{ rawPath: 'id_rsa', operation: 'write' }]);
  });

  it('换行是命令分隔符（多行命令逐行解析）', () => {
    const r = parseBashCommand('echo hi\nrm x');
    expect(r.subcommands).toHaveLength(2);
    expect(r.subcommands[1].verb).toBe('rm');
  });

  it('&& 优先于单 & 判定（cmd1 && cmd2 仍是复合）', () => {
    const r = parseBashCommand('echo a && echo b');
    expect(r.subcommands).toHaveLength(2);
  });

  it('find -exec / -delete 的隐藏文件操作 → indirect', () => {
    expect(parseBashCommand('find . -name "*.tmp" -delete').subcommands[0].kind).toBe('indirect');
    expect(parseBashCommand('find . -exec rm -rf {} +').subcommands[0].kind).toBe('indirect');
    // 普通 find 不受影响
    expect(parseBashCommand('find . -name "*.ts"').subcommands[0].kind).toBe('narrow');
  });

  it('grep -f 的 pattern 文件作为 read 资源提取', () => {
    const r = parseBashCommand('grep -f patterns.txt src/');
    expect(r.subcommands[0].paths).toEqual([
      { rawPath: 'patterns.txt', operation: 'read' },
      { rawPath: 'src/', operation: 'search' },
    ]);
  });

  it('bash -c 深层嵌套超限转 indirect（防栈溢出 DoS）', () => {
    // 2000 层嵌套：不崩溃、超限后转 indirect
    const deep = 'bash -c "'.repeat(2000) + 'echo hi' + '"'.repeat(2000);
    let result;
    expect(() => {
      result = parseBashCommand(deep);
    }).not.toThrow();
    expect(result!.subcommands.some((s) => s.kind === 'indirect')).toBe(true);
  });
});

describe('bash-command parse — 工具函数', () => {
  it('hasGlobChars 识别 glob 通配符', () => {
    expect(hasGlobChars('*.tmp')).toBe(true);
    expect(hasGlobChars('src/**')).toBe(true);
    expect(hasGlobChars('a?b')).toBe(true);
    expect(hasGlobChars('src/foo.ts')).toBe(false);
    expect(hasGlobChars('.env')).toBe(false);
  });

  it('从不 throw（畸形输入返回结构）', () => {
    expect(() => parseBashCommand('')).not.toThrow();
    expect(() => parseBashCommand('   ')).not.toThrow();
    expect(() => parseBashCommand('"unclosed quote')).not.toThrow();
    expect(() => parseBashCommand(';')).not.toThrow();
    expect(() => parseBashCommand('echo a ;;; echo b')).not.toThrow();
  });
});
