import { HTTPClient } from '../utils';

export class MockHttpClient extends HTTPClient {
  constructor(baseURL: string) {
    super(baseURL);
  }
  post = jest.fn();
  get = jest.fn();
}
