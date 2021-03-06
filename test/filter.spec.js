const chai = require('chai');
const spies = require('chai-spies');
const mock = require('mock-require');

chai.use(spies);
const expect = chai.expect;

const regex = /<element\s[^>]*?src(\s+)?=[(\s+)"]?([^>\s"]+__inline=true[^>\s"]*)[^>]*>/gi;

describe('inline assets', () => {
  describe('filter', () => {
    const defaults = {
      enabled: true,
      files: {
        'theme/source/main.file': {
          exists: true,
          content: 'content',
        },
      },
    };
    const setup = ({
      enabled = defaults.enabled,
      files = defaults.files
    } = defaults) => {
      const hexo = {
        config: { inline_assets: { enabled } },
        render: {
          renderSync: chai.spy(({ path }) => files[path].content),
        },
        log: chai.spy.object(['warn']),
        theme_dir: 'theme',
      };

      const html = '<html><body><element src="main.file?__inline=true"></body></html>';

      mock('hexo-fs', {
        existsSync: file => files[file].exists,
        readFileSync: file => files[file].content,
      });

      return {
        hexo,
        html,
        filter: mock.reRequire('../lib/filter'),
      };
    };

    after(() => {
      mock.stopAll();
    });

    it('should do nothing if not enabled', () => {
      const { hexo, html, filter } = setup({ enabled: false });
      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });
      expect(result).to.equal(html);
    });

    it('should inline files', () => {
      const { hexo, filter } = setup();
      const html = '<html><body><element src="main.file?__inline=true"></body></html>';
      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });
      const expectedResult = '<html><body><inline>content</inline></body></html>';
      expect(result).to.equal(expectedResult);
    });

    it('should inline multiple files', () => {
      const { hexo, filter } = setup({
        files: {
          'theme/source/main.file': {
            exists: true,
            content: 'main content',
          },
          'theme/source/another.file': {
            exists: true,
            content: 'another file content',
          },
        },
      });
      const element1 = '<element src="main.file?__inline=true">';
      const element2 = '<element src="another.file?__inline=true">';
      const html = `<html><body>${element1}${element2}</body></html>`;

      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      const expectedLink1 = '<inline>main content</inline>';
      const expectedLink2 = '<inline>another file content</inline>';
      const expectedResult = `<html><body>${expectedLink1}${expectedLink2}</body></html>`;
      expect(result).to.equal(expectedResult);
    });

    it('should only inline files with the inline flag', () => {
      const { hexo, filter } = setup();
      const element1 = '<element src="main.file?__inline=true">';
      const element2 = '<element src="another.file">';
      const html = `<html><body>${element1}${element2}</body></html>`;

      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      const expectedLink1 = '<inline>content</inline>';
      const expectedResult = `<html><body>${expectedLink1}${element2}</body></html>`;
      expect(result).to.equal(expectedResult);
    });

    it('should skip files that do not exist', () => {
      const { hexo, filter } = setup({
        files: {
          'theme/source/main.file': {
            exists: false,
            content: 'main content',
          },
          'theme/source/another.file': {
            exists: true,
            content: 'another file content',
          },
        },
      });
      const element1 = '<element src="main.file?__inline=true">';
      const element2 = '<element src="another.file?__inline=true">';
      const html = `<html><body>${element1}${element2}</body></html>`;

      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      const expectedLink2 = '<inline>another file content</inline>';
      const expectedResult = `<html><body>${element1}${expectedLink2}</body></html>`;
      expect(result).to.equal(expectedResult);
    });

    it('should warn about files that do not exist', () => {
      const { hexo, filter } = setup({
        files: {
          'theme/source/main.file': {
            exists: false,
            content: 'main content',
          },
        },
      });
      const element1 = '<element src="main.file?__inline=true">';
      const html = `<html><body>${element1}</body></html>`;

      filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      expect(hexo.log.warn).to.have.been.called();
    });

    it('should invoke hexo render with the correct params', () => {
      const { hexo, html, filter } = setup();

      filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      expect(hexo.render.renderSync).to.have.been.called.with.exactly({
        path: 'theme/source/main.file',
      });
    });

    it('should warn about filter errors', () => {
      const { hexo, html, filter } = setup();
      hexo.render.renderSync = () => { throw new Error('err'); };

      filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      expect(hexo.log.warn).to.have.been.called();
    });

    it('should return the original string on filter errors', () => {
      const { hexo, html, filter } = setup();
      hexo.render.renderSync = () => { throw new Error('err'); };

      const result = filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      expect(result).to.equal(html);
    });

    it('should use a template for inline content', () => {
      const { hexo, html, filter } = setup();
      const result = filter.call(hexo, {
        text: html,
        regex,
        template: 'my custom {content} template',
      });
      const expectedResult = '<html><body>my custom content template</body></html>';
      expect(result).to.equal(expectedResult);
    });

    it('should log to the console when the hexo logger is not available', () => {
      const { hexo, filter } = setup({
        files: {
          'theme/source/main.file': {
            exists: false,
            content: 'main content',
          },
        },
      });
      hexo.log = undefined;
      global.console.warn = chai.spy();
      const element1 = '<element src="main.file?__inline=true">';
      const html = `<html><body>${element1}</body></html>`;

      filter.call(hexo, {
        text: html,
        regex,
        template: '<inline>{content}</inline>',
      });

      expect(console.warn).to.have.been.called();
    });
  });
});

