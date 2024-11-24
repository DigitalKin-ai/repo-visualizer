import { exec } from '@actions/exec'
import * as core from '@actions/core'
import * as artifact from '@actions/artifact'
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from "fs"
import path from "path"

import { processDir } from "./process-dir.js"
import { Tree } from "./Tree.tsx"

const main = async () => {
  core.info('[INFO] Usage https://github.com/githubocto/repo-visualizer#readme')

  // Load default config
  let config = {
    root_path: "",
    max_depth: 9,
    file_colors: {},
    color_encoding: "type", 
    commit_message: "Repo visualizer: update diagram",
    excluded_paths: [
      "node_modules",
      "dist",
      "build", 
      "coverage",
      ".git",
      ".pytest_cache",
      ".hypothesis",
      ".idea",
      ".vscode",
      ".env",
      ".venv",
      "env",
      "venv",
      "aider",
      "repo-visualizer"
    ],
    excluded_globs: [
      ".aider*",
      "./.aider*",
      "**/.aider*",
      "**/__pycache__/**/*",
      "**/*.pyc",
      "**/*.pyo",
      "**/*.pyd",
      "**/*.so",
      "**/*.dll",
      "**/*.dylib",
      "**/.DS_Store",
      "**/Thumbs.db",
      "**/desktop.ini",
      "**/*.log",
      "**/*.cache",
      "**/*.bak",
      "**/*.swp",
      "**/*.tmp",
      "**/*.temp",
      "**/*~",
      "**/.env",
      "**/.env.*",
      "**/*.local",
      "**/.coverage",
      "**/*.egg-info",
      "**/*.egg",
      "**/*.whl",
      "**/*.manifest",
      "**/.history/**/*",
      "**/.venv/**/*",
      "**/dist/**/*",
      "**/build/**/*",
      "**/.next/**/*",
      "**/coverage/**/*",
      "**/.nyc_output/**/*",
      "**/node_modules/**/*",
      "**/.yarn/**/*"
    ]
  }

  // Try to load config file
  try {
    const configPath = path.join(process.cwd(), '.repo-visualizer.json')
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      config = { ...config, ...fileConfig }
    }
  } catch (err) {
    core.warning('Error loading .repo-visualizer.json config file, using defaults')
  }

  // Override with GitHub Actions inputs if provided
  core.startGroup('Configuration')
  const username = 'repo-visualizer'
  await exec('git', ['config', 'user.name', username])
  await exec('git', [
    'config',
    'user.email',
    `${username}@users.noreply.github.com`,
  ])

  const rootPath = core.getInput("root_path") || config.root_path
  const maxDepth = core.getInput("max_depth") || config.max_depth
  const customFileColors = JSON.parse(core.getInput("file_colors") || JSON.stringify(config.file_colors))
  const colorEncoding = core.getInput("color_encoding") || config.color_encoding
  const commitMessage = core.getInput("commit_message") || config.commit_message
  
  const excludedPathsString = core.getInput("excluded_paths")
  const excludedPaths = excludedPathsString ? 
    excludedPathsString.split(",").map(str => str.trim()) :
    config.excluded_paths

  const excludedGlobsString = core.getInput('excluded_globs')
  const excludedGlobs = excludedGlobsString ? 
    excludedGlobsString.split(";") :
    config.excluded_globs

  core.endGroup()

  const branch = core.getInput("branch")
  const data = await processDir(rootPath, excludedPaths, excludedGlobs);

  let doesBranchExist = true

  if (branch) {
    await exec('git', ['fetch'])

    try {
      await exec('git', ['switch', '-c' , branch,'--track', `origin/${branch}`])
    } catch {
      doesBranchExist = false
      core.info(`Branch ${branch} does not yet exist, creating ${branch}.`)
      await exec('git', ['checkout', '-b', branch])
    }
  }
  const componentCodeString = ReactDOMServer.renderToStaticMarkup(
    <Tree data={data} maxDepth={+maxDepth} colorEncoding={colorEncoding} customFileColors={customFileColors}/>
  );

  const outputFile = core.getInput("output_file") || "./diagram.svg"

  core.setOutput('svg', componentCodeString)

  await fs.writeFileSync(outputFile, componentCodeString)


  await exec('git', ['add', outputFile])
  const diff = await execWithOutput('git', ['status', '--porcelain', outputFile])
  core.info(`diff: ${diff}`)
  if (!diff) {
    core.info('[INFO] No changes to the repo detected, exiting')
    return
  }

  const shouldPush = (() => {
    const input = core.getInput('should_push')
    if (!input) return false
    // Normalize various boolean string representations
    const normalized = input.toString().toLowerCase().trim()
    return ['true', 't', 'yes', 'y', '1'].includes(normalized)
  })()
  if (shouldPush) {
    core.startGroup('Commit and push diagram') 
    await exec('git', ['commit', '-m', commitMessage])

    if (doesBranchExist) {
      await exec('git', ['push'])
    } else {
      await exec('git', ['push', '--set-upstream', 'origin', branch])
    }

    if (branch) {
      await exec('git', 'checkout', '-')
    }
    core.endGroup()
  }

  const shouldUpload = core.getInput('artifact_name') !== ''
  if (shouldUpload) {
    core.startGroup('Upload diagram to artifacts')
    const client = artifact.create()
    const result = await client.uploadArtifact(core.getInput('artifact_name'), [outputFile], '.')
    if (result.failedItems.length > 0) {
      throw 'Artifact was not uploaded successfully.'
    }
    core.endGroup()
  }

  console.log("All set!")
}

main().catch((e) => {
  core.setFailed(e)
})

function execWithOutput(command, args) {
  return new Promise((resolve, reject) => {
    try {
      exec(command, args, {
        listeners: {
          stdout: function (res) {
            core.info(res.toString())
            resolve(res.toString())
          },
          stderr: function (res) {
            core.info(res.toString())
            reject(res.toString())
          }
        }
      })
    } catch (e) {
      reject(e)
    }
  })
}
