/* 
  This script is responsible for: 
  - Triggered by GA workflow
  - Connecting with contentful API
  - Accomplishes a simple update action 
  - Runs a secondary parse script
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

/* 
  returns a formatted reference id:
  in format of <org>_<repo>__docs_<filename>
  i.e. slackapi_bolt-js__docs_mydoc.md
  Note: CMS accepts only _, - or . in ids
*/ 
function formatRefId(path, locale) {
  let refId;
  /**
   * languages in other files contain a prefix 
   * e.g. ja_ in docs/__advanced/ja_document_name_here
   * for non en-US locales
   * remove the language prefix on the filename
   * before generating the refId
   * e.g. docs/ja_document_name_here => docs/document_name_here 
   * */
  if(locale !== 'en-US') {
    console.log('++ the path before is ', path);
    let tmp = path.split('/');
    let filename = tmp[tmp.length - 1];
    let i = filename.indexOf('_');
    tmp[tmp.length - 1] = filename.slice(i + 1);
    path = tmp.join('_');
    console.log('++ the path after is ', path);
  }
  refId = `${process.env.REPOSITORY}__${path}`;
  return refId.replaceAll('/', '_'); 
}

async function publishToCms() {
  const allChangedFiles = await readData(getPaths());
  const fPaths = Object.keys(allChangedFiles);
  for (const path of fPaths) {
    const fContent = allChangedFiles[path];
    const refId = formatRefId(path);
    
    // if changed file has content
    if (fContent !== null) {
      const { frontMatter } = parse(fContent);
      const currLocale = getLocale(frontMatter['lang']);
      
      // Try to update entry  
      client.getSpace(spaceId)
      .then((space) => space.getEnvironment(envId))
      .then((environment) => environment.getEntry(refId))
      .then(async (entry) => {
        console.log('LOG: Existing entry, updating.. ', entry.sys.id);
        entry.fields.title[currLocale] = frontMatter['title'];
        entry.fields.author[currLocale] = [process.env.AUTHOR];
        entry.fields.markdown[currLocale] = fContent;
        entry.fields.source[currLocale] = `https://github.com/${process.env.REPOSITORY}/blob/main/${path}`;
        await entry.update();
        console.log('LOG: we should have updated the entry!', entry);
      })
      .catch(err => {
        console.log("LOG: There was an error: \n", err);
        console.log('Trying to print error status1', typeof err);
        console.log('Trying to print error status2', err['status']);
        console.log('Trying to print error status3', err.NotFound);
      });

      // Create a new entry
      // client.getSpace(spaceId)
      // .then((space) => space.getEnvironment(envId))
      // .then((environment) => {
      //   let pageEntry = getPageEntry(frontMatter, currLocale, path, fContent);
      //   environment.createEntryWithId('page', refId, pageEntry)
      // })
      // .then((entry) => console.log("LOG: New entry created: ", entry))
      // .catch((error) => console.log("LOG: Create attempted and failed: ", error))
    }
    // When there's no content, a file is deleted or renamed
    if (fContent === null) {
      // TODO: could this be archive action?
      client.getSpace(spaceId)
        .then(space => space.getEnvironment(envId))
        .then(environment => environment.deleteEntry(refId))
        .catch(error => {
          console.log('DELETE ERROR: ', error)
        })
    }
  }
}

// utility structure for supported locale lookup
const getLocale = (lang) => {
  console.log('getting locale', lang);
  if (!lang) return;
  const locales =  new Map();
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

// returns a Page entry
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
- change it so that docs are identified by slug
- when doc is renamed (i.e new ref ID) 
  - can create new Page 
  - can delete existing Page
- can update Authors field with the full list of authors
- can pull locale field from the front-matter 
- can create, delete, update i.e. handle a JP language Page

*/