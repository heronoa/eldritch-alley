import { HttpException, type HttpStatus, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { readRequired } from './config';

/**
 * What turns a container into the HTTP application this platform is. It is separate from `main.ts` so
 * that the tests start the same application the deployment does: a middleware missing from the tests
 * would be a middleware that only breaks in production, where nobody looks.
 */
export function configureApp(app: INestApplication): INestApplication {
  // The session and the flow are cookies, so something has to parse them; nothing else about the
  // platform is a form.
  app.use(cookieParser());

  // One client, and it calls with a cookie: the browser sends it only when the response allows
  // credentials, and `origin: '*'` is not allowed to be combined with that. Any other origin is told
  // nothing at all — not even that the route exists.
  // A list and not the string itself: the `cors` middleware sends a string `origin` back on every
  // answer, whoever asked, and only a list makes it compare the request's origin before echoing one.
  app.enableCors({
    origin: [readRequired(process.env.CLIENT_ORIGIN, 'CLIENT_ORIGIN')],
    credentials: true,
  });

  return app;
}

/**
 * Every error this platform answers with, in the one shape the client renders: `{ code, message }`.
 * Written once so that a route cannot invent a fifth way of saying no, and so that a message meant for
 * a developer never reaches the browser by accident — anything a provider or a database said stays in
 * the log.
 */
export function apiError(status: HttpStatus, code: string, message: string): HttpException {
  return new HttpException({ code, message }, status);
}
