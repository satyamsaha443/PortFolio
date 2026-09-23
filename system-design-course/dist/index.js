#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, "..", "content");
const INDEX_FILE = join(__dirname, "course-index.json");
marked.use(markedTerminal());
function loadCourseIndex() {
    if (!existsSync(INDEX_FILE)) {
        console.error(chalk.red("Course index not found. Run `npm run build` first."));
        process.exit(1);
    }
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
}
function renderLesson(lesson) {
    const contentPath = join(CONTENT_DIR, lesson.contentFile);
    if (!existsSync(contentPath)) {
        console.log(chalk.yellow(`Content not yet written: ${lesson.contentFile}`));
        return;
    }
    const md = readFileSync(contentPath, "utf-8");
    console.log(marked(md));
}
function printModuleHeader(mod) {
    console.log("\n" + chalk.bold.blue("═".repeat(60)));
    console.log(chalk.bold.blue(`  MODULE ${mod.number}: ${mod.title}`));
    console.log(chalk.blue("═".repeat(60)));
    console.log(chalk.dim(`  ${mod.description}`));
    console.log(chalk.dim(`  Estimated time: ${mod.estimatedHours}h | Audience: ${mod.audienceLevels.join(", ")}`));
    console.log();
}
function printTableOfContents(course) {
    console.log(chalk.bold.green("\n📚 SYSTEM DESIGN: ZERO TO MASTERY"));
    console.log(chalk.bold.green("   Complete Course Table of Contents\n"));
    console.log(chalk.dim("─".repeat(60)));
    for (const mod of course.modules) {
        console.log(`\n${chalk.bold.yellow(`M${mod.number}`)} ${chalk.bold(mod.title)} ` +
            chalk.dim(`[${mod.estimatedHours}h]`));
        for (const lesson of mod.lessons) {
            const levelTag = lesson.audienceLevels
                .map((l) => l === "beginner" ? chalk.green("B") :
                l === "pro" ? chalk.yellow("P") :
                    chalk.red("S"))
                .join("");
            console.log(`   ${chalk.dim("│")} ${levelTag} ${lesson.title} ${chalk.dim(`~${lesson.estimatedMinutes}m`)}`);
        }
    }
    console.log(chalk.dim("\n─".repeat(60)));
    console.log(chalk.dim("B=Beginner  P=Pro  S=Senior\n"));
}
const program = new Command();
program
    .name("sdc")
    .description("System Design Course — interactive CLI reader")
    .version("1.0.0");
program
    .command("toc")
    .description("Print the full table of contents")
    .action(() => {
    const course = loadCourseIndex();
    printTableOfContents(course);
});
program
    .command("read <moduleNum> [lessonNum]")
    .description("Read a lesson (e.g. sdc read 1 3 reads Module 1, Lesson 3)")
    .action((moduleNum, lessonNum) => {
    const course = loadCourseIndex();
    const mod = course.modules.find((m) => m.number === parseInt(moduleNum));
    if (!mod) {
        console.error(chalk.red(`Module ${moduleNum} not found.`));
        process.exit(1);
    }
    printModuleHeader(mod);
    if (lessonNum === undefined) {
        for (const lesson of mod.lessons) {
            console.log(chalk.bold(`\n  ${lesson.title}`));
            renderLesson(lesson);
        }
    }
    else {
        const lesson = mod.lessons[parseInt(lessonNum) - 1];
        if (!lesson) {
            console.error(chalk.red(`Lesson ${lessonNum} not found in Module ${moduleNum}.`));
            process.exit(1);
        }
        renderLesson(lesson);
    }
});
program.parse();
//# sourceMappingURL=index.js.map