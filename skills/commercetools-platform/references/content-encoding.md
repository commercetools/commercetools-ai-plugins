# Content Encoding in API

**Q: Is it possible for us to check the api calls from customer include content encoding?**

We don't log request bodies as a rule. Request parameters in the logs are redacted. Post bodies are encrypted by https. Auth request bodies are url encoded.

---

**Q: Can we add gzip encoding in API calls to compress response times?**

Yes, it is recommended to add gzip encoding to all API requests. The gzip middleware should be added by default when using the defaultClient builder methods. See below:

https://docs.commercetools.com/sdk/java-sdk-middleware#acceptgzipmiddleware

```plaintext
.addAcceptGZipMiddleware()
```

For completion, if the request is using `Content-Encoding: gzip` to compress the body, the API is also able to deal with it.
