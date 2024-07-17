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
  .description('生成api函数，url路径不能以/开头')
  .option('-u, --swag-url <swagUrl>', '指定swagger文档地址')
  .option('-c, --cookie <cookie>', 'url的授权cookie')
  .option('-l, --list [showList]', '查询api接口')
  .action(async (urls, options) => {
    console.log('开始运行...');

    const { swagFile, apiBase = './src/api', defBase = './src/models', fileHeader, ...config } = mergeConfig(options);
    if (!options.swUrl && swagFile) {
      try {
        config.swagJson = require(path.resolve(swagFile));
      } catch (error) {
        if (!config.swagUrl) {
          exitWithError('获取swagger文档失败，请提供本地或在线文档！');
        }
      }
    }

    const noapi = createNoApi(config);

    if (!noapi.swagJson) {
      const result = await noapi.fetchDataSource();
      const swFilePath = path.resolve(swagFile || 'noapi-swagger-doc.json');
      await writeToFile(swFilePath, JSON.stringify(result, null, 2));
    }

    urls = urls?.split(',').map((url: string) => `/${url}`);

    if (options.list) {
      const apis = await noapi.listApi(urls);
      if (!apis?.length) {
        console.log('没有找到api！');
      } else {
        console.log(apis);
        console.log(`共找到${apis.length}条api`);
      }
      return;
    }

    if (!urls) {
      exitWithError('请提供url地址');
    }

    noapi.generateByUrls(urls, async ({ sourceType, sourceCode, fileDir, typeName }) => {
      if (sourceType === 'api') {
        const filePath = path.resolve(apiBase, fileDir);
        if (fileHeader && !await checkExists(filePath)) {
          sourceCode = (typeof fileHeader === 'function' ? await fileHeader() : fileHeader) + '\n' + sourceCode;
        }
        appendToFile(filePath, sourceCode);
      } else {
        const filePath = path.resolve(defBase, fileDir);
        writeToFile(filePath, sourceCode);
        writeToIndexFile(typeName!, path.resolve(defBase), filePath);
      }
    });
  });

// def命令
program
  .command('def <defKeys>')
  .description('生成类型定义，defKeys可通过api命令加-l参数获取')
  .option('-u, --swag-url <swagUrl>', '指定swagger文档地址')
  .option('-c, --cookie <cookie>', 'url的授权cookie')
  .action(async (defKeys: string, options) => {
    console.log('开始运行...');

    const { swagFile, defBase = './src/models', ...config } = mergeConfig(options);
    if (!options.swUrl && swagFile) {
      try {
        config.swagJson = require(path.resolve(swagFile));
      } catch (error) {
        if (!config.swagUrl) {
          exitWithError('获取swagger文档失败，请提供本地或在线文档！');
        }
      }
    }

    const noapi = createNoApi(config);

    if (!noapi.swagJson) {
      const result = await noapi.fetchDataSource();
      const swFilePath = path.resolve(swagFile || 'noapi-swagger-doc.json');
      await writeToFile(swFilePath, JSON.stringify(result, null, 2));
    }

    noapi.generateByDefs(
      defKeys.split(',').map((key) => ({ key })),
      ({ sourceCode, fileDir, typeName }) => {
        const filePath = path.resolve(defBase, fileDir);
        writeToFile(filePath, sourceCode);
        writeToIndexFile(typeName, path.resolve(defBase), filePath);
      }
    );
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
    const swUrl = await rl.question('输入 swagger 文档地址: ');

    const configFilePath = getConfigPath();
    if (await checkExists(configFilePath)) {
      const isCover = await rl.question(`配置文件${configFilePath}已存在，是否覆盖？(Y/n): `) || 'y';
      if (isCover.toLowerCase() !== 'y') {
        exitWithError('已取消！');
      }
    }

    const configFile = await createConfigFile(swUrl, configFilePath);

    rl.close();

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

    const swFilePath = path.resolve(config.swagFile || 'noapi-swagger-doc.json');
    await writeToFile(swFilePath, JSON.stringify(result, null, 2));

    console.log('文档更新成功！');
  });

program.parse(process.argv);
