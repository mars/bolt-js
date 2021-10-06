/* 
  This script is triggered by github actions workflow and is responsible for
  publishing documentation updates to contentful cms
 */
import contentful from 'contentful-management';
import fs from 'fs';
import marked from 'marked';

// init client
const spaceId = 'lfws4sw3zx32';
const envId = 'master';
const client = contentful.createClient({
  accessToken: process.env.CONTENTFUL_API_KEY
});

publishToCms();

async function publishToCms() {
  const allChangedFiles = await readData(getPaths());
  const fPaths = Object.keys(allChangedFiles);
  const log = {};
  
  // process each changed file
  for (const path of fPaths) {
    const fContent = allChangedFiles[path];
    const { frontMatter } = parse(fContent);
    const refId = formatRefId(frontMatter);
    
    // if changed file has content
    if (fContent !== null) {
      // arrange
      if (!hasRequiredFields(frontMatter)) {
        log[path] = 'Missing required fields';
        continue;
      }
      const currLocale = getLocale(frontMatter['lang']);
      // Try go fetch the entry
      const space = await client.getSpace(spaceId);
      const env = await space.getEnvironment(envId);
      const entry = await env.getEntry(refId);
      console.log(entry);
    //   // Try to update entry  
    //   client.getSpace(spaceId)
    //   .then((space) => space.getEnvironment(envId))
    //   .then((environment) => environment.getEntry(refId))
    //   .then(async (entry) => {
    //     console.log('LOG: Existing entry, updating.. ', entry.sys.id);
    //     entry.fields.title[currLocale] = frontMatter['title'];
    //     entry.fields.author[currLocale] = [process.env.AUTHOR];
    //     entry.fields.markdown[currLocale] = fContent;
    //     entry.fields.source[currLocale] = `https://github.com/${process.env.REPOSITORY}/blob/main/${path}`;
    //     await entry.update();
    //     console.log('LOG: Entry updated');
    //     log[path] = `Entry updated: ${entry.sys.id} `;
    //   })
    //   .catch((err) => {
    //     // Create a new entry if entry is not found
    //     if (err.name === 'NotFound') {
    //       client.getSpace(spaceId)
    //       .then((space) => space.getEnvironment(envId))
    //       .then(async (environment) => {
    //         let pageEntry = getPageEntry(frontMatter, currLocale, path, fContent);
    //         await environment.createEntryWithId('page', refId, pageEntry);
    //         console.log('LOG: Entry created');
    //         log[path] = `Entry created: ${entry.sys.id} `;
    //       })
    //       .catch((error) => {
    //         console.log("LOG: Create attempted and failed: ", error);
    //         log[path] = `Create attempted and failed: ${error}`
    //       });
    //     } else {
    //       console.log("LOG: Unresolved error: \n", err);
    //       log[path] = `Unresolved error: ${err}`
    //     }
    //   });
    // }
    // // When there's no content, a file is deleted or renamed
    // if (fContent === null) {
    //   // TODO: could this be archive action?
    //   client.getSpace(spaceId)
    //     .then(space => space.getEnvironment(envId))
    //     .then(environment => environment.deleteEntry(refId))
    //     .then(() => log[path] = `Deleted entry: ${refId}`)
    //     .catch(error => {
    //       console.log('DELETE ERROR: ', error);
    //       log[path] = `Error deleting entry: ${error}`;
    //     })
    }
  }
  // TODO return this output to Github action
  console.log('===LOG OUTPUT START====\n', log);
  console.log('===LOG OUTPUT END======');
}

// helpers

// checks for required fields
const hasRequiredFields = (frontMatter) => {
  return frontMatter.slug !== undefined &&
   frontMatter.lang !== undefined &&
    frontMatter.title !== undefined;
};

/**
 * returns a formatted reference id
 * in format of <org>__<repo>__docs__<filename>
 * i.e. slackapi_bolt-js__docs_mydoc.md
 * Note: CMS accepts only _, - or . in ids
*/ 
// function formatRefId(path, locale) {
//   let refId;
//   /**
//    * languages in other files contain a prefix 
//    * e.g. ja_ in docs/_advanced/ja_document_name_here
//    * for non en-US locales
//    * remove the language prefix on the filename
//    * before generating the refId
//    * e.g. docs/ja_document_name_here => docs/document_name_here 
//    * */
//   if(locale !== 'en-US') {
//     console.log('++ the path before is ', path);
//     let tmp = path.split('/');
//     let filename = tmp[tmp.length - 1];
//     let i = filename.indexOf('_');
//     tmp[tmp.length - 1] = filename.slice(i + 1);
//     path = tmp.join('_');
//     console.log('++ the path after is ', path);
//   }
//   refId = `${process.env.REPOSITORY}__${path}`;
//   return refId.replaceAll('/', '_'); 
// }

function formatRefId(frontMatter) {
  let refId;
  /**
   * generates a ref id in the following format:
   * <org>_<repo>_<slug>
   * */
  refId = `${process.env.REPOSITORY}_${frontMatter.slug}`;
  console.log('ref id is: \n', refId.replaceAll('/', '_'));
  return refId.replaceAll('/', '_'); 
}

// lookup supported locales
const getLocale = (lang) => {
  if (!lang) return;
  const locales =  new Map();
  // TODO when supporting new locales, add an entry here
  locales.set(new Set(['en', 'en-US']), 'en-US');
  locales.set(new Set(['jp', 'ja-jp']), 'ja-JP');

  let currLocale;
  Array.from(locales.keys()).forEach((k) => {
    if (k.has(lang)) {
      currLocale = locales.get(k);  
    }
  });
  return currLocale;
}

// formats a new page entry
const getPageEntry = (frontMatter, currLocale, path, fContent) => {
  console.log('getting page entry', frontMatter);
  // search
  if (getLocale(frontMatter['lang'])) {
    return {
      fields: {
        title: {
          [currLocale]: frontMatter['title']
        },
        author: {
          [currLocale]: [process.env.AUTHOR]
        },
        source: {
          [currLocale]: `https://github.com/${process.env.REPOSITORY}/blob/main/${path}`,
        },
        markdown: {
          [currLocale]: fContent
        },
      }
    };
  } else {
    return null;
  }
}

// returns changed filepaths including docs/* only
function getPaths() {
  return process.env.FILES_CHANGED
  .split(' ') 
  .filter(str => /^docs\/.*/.test(str)); 
}

// accepts an array of paths and returns an object where
// key is filepath and value is the associated file data
async function readData(fPaths) {
  let fileData = {};
  for (const path of fPaths) {
    try {
      let data = await fs.promises.readFile(path, 'utf8');
      fileData[path] = data;
    } catch (err) {
      fileData[path] = null;
    }
  }
  return fileData;
}

// returns obj with front matter + page content separate
const parse = (data) => {
  const lexed = marked.lexer(data);
  const frontMatter = {};
  if (hasFrontMatter(lexed)) {
    let split = lexed[1]['raw'].split('\n');
    for (const entry of split) {
      let [key, value] = entry.split(':');
      frontMatter[key] = value.trim();
    }
  }
  const content = lexed.filter((val, i) => i !== 0 && i !== 1 && i !== 2); 
  return {
    frontMatter,
    content
  }
}

// utility object with lexed types data
const TYPES = Object.freeze({
  hr: "hr",
  space: "space",
  code: "code",
  paragraph: "paragraph"
});

// returns true if the document has horizontal rule delineated front matter
const hasFrontMatter = (lexed) => {
  return ((lexed)[0] && lexed[2] && lexed[0]["type"] === TYPES.hr && lexed[2]["type"] === TYPES.hr);
}


/* 

TODO
- can create a new Page ✅
- can delete an existing Page ✅
- can update an existing Page ✅
- add validation of front matter ✅
- Add simple activity logging ✅
- Make activity logging accessible to other github actions 
- 👀 using slug from front-matter for unique identifier 
  - when a slug is updated?? (i.e new ref ID) 
    - can delete existing Page
- can pull locale field from the front-matter ✅
- can add both english and japanese example at the same time
- can create, delete, update i.e. handle a JP language Page 
- can update Author(s) field with the full list of authors
- Includes a tag field with the repo
- Create a standalone triggerable publish action (not triggered by changed files) i.e. a publish-all

Docs requirements
- Required frontmatter: lang, title, slug (must be unique)
- Slugs
  - Slugs should use - not _ e.g. listening-messages
  - Slugs must be unique (excepting localized versions. These must always match in order
    for articles in other languages to be associated properly). 
  - Once a slug has been established, it should not be updated. Updating a slug will break links
  - Slugs should also serve as the unique reference for the entry
- Making a change
  - Changing the name of a article, - update the title field (should match the filename)

Migration requirements
Handling failures
- If update or creation or deletion fails, check the log

*/