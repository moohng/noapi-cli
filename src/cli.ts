#!/usr/bin/env node

import path from 'path';
import { program } from 'commander';
import * as readline from 'readline/promises';
import { createNoApi, createConfigFile, getConfigPath, mergeConfig, appendToFile, checkExists, writeToFile, writeToIndexFile } from '@noapi/core';

/**
 * 报错并退出
 * @param message
 */
function exitWithError(...messages: string[]) {
  console.error('Error:', ...messages);
  // 如果是nodejs环境，退出程序
  if (typeof process !== 'undefined' && process.exit) {
    process.exit(1);
  } else {
    throw new Error(messages.join('\n'));
  }
}

program
  .version('1.0.0')
  .description(
    '欢迎使用 NoAPI，使用 npx @noapi/cli api url1,url2... 立即体验！\n\
如果生成的api方法或类型文件有问题，建议使用-p参数查看接口相关信息，然后使用def命令手动生成类型定义。\n\
swUrl、cookie等相关参数建议写在配置文件noapi.config.js中。'
  );

// api命令
program
  .command('api [urls]', { isDefault: true }) // <urls...> 可以解析成一个数组
  .description('生成api函数，url路径不能以/开头，多个url用逗号分隔')
  .option('-m, --method [method]', '指定接口方法，不指定可能会生成多个api函数')
  .option('-d, --only-def [onlyDef]', '只生成类型定义文件')
  .option('-u, --swag-url <swagUrl>', '指定swagger文档地址')
  .option('-c, --cookie <cookie>', 'url的授权cookie')
  .option('-l, --list [showList]', '查询api接口，支持搜索')
  .action(async (urls, options) => {
    const execStart = performance.now();
    console.log('开始运行...');
    console.log('urls：', urls);
    console.log('参数：', options);

    const { onlyDef = false, method, ...otherOptions } = options;
    const { swagFile, apiBase = './src/api', defBase, fileHeader, exportFromIndex = true, ...config } = mergeConfig(otherOptions);
    const swFilePath = path.resolve(swagFile || path.join(apiBase, 'noapi-swagger-doc.json'));
    if (!options.swagUrl) {
      try {
        config.swagJson = require(swFilePath);
      } catch (error) {
        if (!config.swagUrl) {
          exitWithError('获取swagger文档失败，请提供本地或在线文档！');
        }
      }
    }

    const noapi = createNoApi(config);

    if (!noapi.swagJson) {
      const result = await noapi.fetchDataSource();
      await writeToFile(swFilePath, JSON.stringify(result, null, 2));
    }

    if (options.list) {
      let apis = await noapi.listApi();
      if (typeof options.list === 'string') {
        const keyword = options.list.trim();
        apis = apis.filter((api) => api.url.includes(keyword) || api.summary.includes(keyword) || api.tag?.includes(keyword));
      }
      if (!apis?.length) {
        console.log('没有找到api！');
      } else {
        console.log(apis);
        console.log(`共找到 ${apis.length} 条 api`);
      }
      console.log(`运行耗时 ${(performance.now() - execStart).toFixed(2)}ms`);
      return;
    }

    urls = urls?.split(',').map((url: string) => `/${url}`);

    if (!urls) {
      exitWithError('请提供url地址');
    }

    await noapi.generateByUrls(urls.map((url: string) => {
      return {
        url,
        method,
        onlyDef,
      };
    }), async ({ sourceType, sourceCode, filePath: relativeFilePath, fileDir, fileName, typeName }) => {
      if (sourceType === 'api') {
        const filePath = path.resolve(apiBase, relativeFilePath);
        if (fileHeader && !await checkExists(filePath)) {
          sourceCode = (typeof fileHeader === 'function' ? await fileHeader() : fileHeader) + '\n' + sourceCode;
        }
        appendToFile(filePath, sourceCode);
      } else {
        const defDir = defBase || path.join(apiBase, fileDir);
        const filePath = path.resolve(defDir, fileName);
        writeToFile(filePath, sourceCode);
        if (exportFromIndex) {
          writeToIndexFile(typeName!, path.resolve(defDir), filePath);
        }
      }
    });

    console.log(`运行耗时 ${(performance.now() - execStart).toFixed(2)}ms`);
  });

// 初始化配置命令
program
  .command('init')
  .description('初始化配置文件')
  .action(async () => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const swagUrl = await rl.question('输入 swagger 文档地址: ');

    const configFilePath = getConfigPath();
    if (await checkExists(configFilePath)) {
      const isCover = await rl.question(`配置文件${configFilePath}已存在，是否覆盖？(y/N): `) || 'n';
      rl.close();
      if (isCover.toLowerCase() !== 'y') {
        exitWithError('已取消！');
      }
    }

    const configFile = await createConfigFile(swagUrl, configFilePath);

    console.log(`配置文件${configFile}已生成，可自定义配置。`);
  });

// 更新文档
program
  .command('update')
  .description('更新swagger文档')
  .option('-u, --swag-url <swagUrl>', '指定swagger文档地址')
  .option('-c, --cookie <cookie>', 'url的授权cookie')
  .action(async (options) => {
    console.log('开始运行...');

    const config = mergeConfig(options);

    const noapi = createNoApi(config);

    const result = await noapi.fetchDataSource();

    const swFilePath = path.resolve(config.swagFile || path.join(config.apiBase || './src/api', 'noapi-swagger-doc.json'));
    await writeToFile(swFilePath, JSON.stringify(result, null, 2));

    console.log('文档更新成功！', swFilePath);
  });

program.parse(process.argv);
