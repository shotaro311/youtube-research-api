import { ResearchConsole } from "../src/components/research-console";
import { readPencilConsoleDesign } from "../src/server/pencil-console-design";

export default async function HomePage(): Promise<React.JSX.Element> {
  const design = await readPencilConsoleDesign();

  return <ResearchConsole design={design} />;
}
