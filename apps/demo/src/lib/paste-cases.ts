/** Permission-cleared public paste cases. Never include Brochure.docx or fixtures/private. */

export type PasteCase = {
  id: string;
  title: string;
  author: string;
  source: string;
  href: string;
  sample: string;
  /** Live fetch was blocked; the HTML is a local snapshot of the author's article. */
  snapshot?: boolean;
  snapshotNote?: string;
};

export const PASTE_CASES: PasteCase[] = [
  {
    id: "newspulse",
    title: "NewsPulse AI – Real-Time News Analysis with LLMs & Web Scraping via Bright Data",
    author: "Suman Kumar",
    source: "DEV Community",
    href: "https://dev.to/sumankalia/newspulseai-real-time-news-intelligence-powered-by-web-data-agents-2bep",
    sample: "/samples/newspulse.html",
  },
  {
    id: "workers",
    title: "Web workers in ReactJs",
    author: "Suman Kumar",
    source: "DEV Community",
    href: "https://dev.to/sumankalia/web-workers-in-reactjs-4bc7",
    sample: "/samples/web-workers.html",
  },
  {
    id: "indexeddb",
    title: "Learn IndexedDB: Creating a CRUD Application with IndexedDB and React",
    author: "Suman Kumar",
    source: "Level Up Coding",
    href: "https://medium.com/gitconnected/learn-indexeddb-creating-a-crud-application-with-indexeddb-and-react-70752f19e753",
    sample: "/samples/indexeddb.html",
    snapshot: true,
    snapshotNote: "Medium returned 403 from this environment; the sample is a local snapshot of Sandeep's article, with the byline kept.",
  },
];
