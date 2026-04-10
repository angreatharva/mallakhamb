// Script to replace console.log with logger in source files
const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/pages/shared/ForgotPassword.jsx',
  'src/pages/judge/JudgeScoring.jsx',
  'src/pages/admin/AdminScoring.jsx',
];

filesToFix.forEach((file) => {
  const filePath = path.join(__dirname, file);

  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if logger is already imported
    const hasLoggerImport =
      content.includes("from '../utils/logger'") || content.includes('from "../utils/logger"');

    // Add logger import if not present
    if (!hasLoggerImport && content.includes('console.log')) {
      // Find the last import statement
      const importRegex = /import .+ from .+;/g;
      const imports = content.match(importRegex);

      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        content = content.replace(
          lastImport,
          lastImport + "\nimport { logger } from '../utils/logger';"
        );
      }
    }

    // Replace console.log with logger.log
    content = content.replace(/console\.log\(/g, 'logger.log(');

    // Replace console.error with logger.error
    content = content.replace(/console\.error\(/g, 'logger.error(');

    // Replace console.warn with logger.warn
    content = content.replace(/console\.warn\(/g, 'logger.warn(');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${file}`);
  } catch (error) {
    console.error(`❌ Error fixing ${file}:`, error.message);
  }
});

console.log('\n✅ All files processed!');
