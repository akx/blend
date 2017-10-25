/* eslint-disable class-methods-use-this */
const { parse } = require('url');
const bodyParser = require('body-parser');
const multer = require('multer');

const middlewareToPromise = (
  middleware => (req, res) => new Promise((resolve, reject) => middleware(req, res, err => (err ? reject(err) : resolve({ req, res }))))
);

class Blend {
  constructor() {
    this.routes = [];
    this.handle = this.handle.bind(this);
    this.parseJSONBody = middlewareToPromise(bodyParser.json());
    this.parseFormBody = middlewareToPromise(bodyParser.urlencoded({ extended: true }));
    this.parseTextBody = middlewareToPromise(bodyParser.text());
    this.parseMultipartBody = middlewareToPromise(multer().none());
  }
  on(match, handler) {
    if (typeof match === 'string') {
      match = { pathname: match }; // eslint-disable-line no-param-reassign
    }
    this.routes.push({ match, handler });
  }
  matchRoute(route, request) {
    const { match } = route;
    if (typeof match === 'function') {
      return match.call(this, request, route);
    }
    return Object.keys(match).every((key) => {
      const matchVal = match[key];
      const reqVal = request[key];
      if (typeof matchVal.test === 'function') return matchVal.test(reqVal);
      return matchVal == reqVal; // eslint-disable-line eqeqeq
    });
  }
  handle404(req) {
    return Promise.resolve({ status: 404, text: `404: ${req.url}` });
  }
  handleError(req, err) {
    return Promise.resolve({ status: 500, text: `Error: ${err}` });
  }
  convertResponse(ro, request, response) {
    return new Promise((resolve, reject) => {
      const writeCallback = (err) => {
        if (err) reject(err);
        else resolve();
      };
      const headers = Object.assign({}, ro.headers || {});
      Object.keys(headers).forEach((header) => {
        response.setHeader(header, headers[header]);
      });
      response.status = ro.status || 200;
      if (ro.json) {
        response.setHeader('Content-Type', 'application/json; charset=UTF-8');
        const body = Buffer.from(JSON.stringify(ro.json));
        response.write(body, null, writeCallback);
      } else if (ro.text) {
        response.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        response.write(ro.text, 'utf-8', writeCallback);
      } else if (ro.body) {
        response.write(ro.body, null, writeCallback);
      } else {
        console.error('No body in response', ro, 'to request', request);
        response.status = 500;
        response.write('Internal error (see console)', null, writeCallback);
      }
    });
  }
  preprocessRequest(request, response) { // eslint-disable-line
    Object.assign(request, parse(request.url, true));
    if (request.method === 'GET' || request.method === 'HEAD') return Promise.resolve(this);
    return Promise.resolve(this)
      .then(() => this.parseFormBody(request, response))
      .then(() => this.parseJSONBody(request, response))
      .then(() => this.parseTextBody(request, response))
      .then(() => this.parseMultipartBody(request, response));
  }
  handle(request, response) {
    this.preprocessRequest(request, response)
      .then(() => {
        const route = this.routes.find(r => this.matchRoute(r, request));
        const handler = (route ? route.handler : this.handle404.bind(this));
        return handler;
      })
      .then(handler => Promise.resolve(handler(request)))
      .catch(err => this.handleError(request, err))
      .then(ro => this.convertResponse(ro, request, response))
      .then(() => response.end())
      .catch(err => {
        console.warn(request, err);
      });
  }
}

module.exports = Blend;