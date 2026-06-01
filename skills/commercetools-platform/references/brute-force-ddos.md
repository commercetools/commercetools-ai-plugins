# Brute Force Attacks & DDoS

## Question

How does commercetools handle a brute force attack on the Authorization endpoint? What additional guidance should be given to customers for how to mitigate this type of attack and / or Denial of Service?

## Response

- Commercetools employs Standard DDoS protection in place (via CloudArmor APIs) across all endpoints.
- Commercetools Standard network DDoS protection: basic always-on protection for network load balancers, protocol forwarding, or VMs with public IP addresses. This includes forwarding rule enforcement and automatic rate limiting.

## How Customers Can Help Mitigate Attacks

- Rotating API credentials is generally a good idea. A high-throughput brute force attack will surely be caught by our DDoS protection. If they are worried about (really) long running (i.e. months long) brute force attacks, rotating API credentials helps against the brute force attack.
- Commercetools has some guidance (from our developers) around API Security Best Practices which includes a section for Access, OAuth, JWT and Authentication.
- Considering the worst case scenario where we are not able to block (using the standard DDOS protection) and our APIs are not responding, it would be managed as a security incident.

## Best Practices

### Authentication / JWT and OAuth

- Use Max Retry and jail features for login patterns.
- Don't reinvent the wheel in Authentication, token generation, password storage. Use the standards.
- Use encryption on all sensitive data.
- Don't store sensitive data in the JWT payload — it can be decoded easily (https://jwt.io/#debugger-io).
- Make token expiration (TTL, RTTL) as short as possible.

### Access

- Limit requests (Throttling) to avoid DDoS / brute-force attacks.
- Use HTTPS on server side to avoid MITM (Man in the Middle Attack).
- Use HSTS header with SSL to avoid SSL Strip attack.
- For private APIs, only allow access from whitelisted IPs/hosts.

### Handling Input

- Use an API Gateway service to enable caching, Rate Limit policies (e.g. Quota, Spike Arrest, or Concurrent Rate Limit) and deploy APIs resources dynamically.
- Don't include any sensitive data (credentials, passwords, security tokens, or API keys) in the URL — use standard Authorization header instead.
- Validate user input to avoid common vulnerabilities (e.g. XSS, SQL-Injection, Remote Code Execution, etc.).
- Validate content-type of posted data as you accept (e.g. application/x-www-form-urlencoded, multipart/form-data, application/json, etc.).
- Validate content-type on request Accept header (Content Negotiation) to allow only your supported format (e.g. application/xml, application/json, etc.) and respond with 406 Not Acceptable response if not matched.
- Use the proper HTTP method according to the operation: GET (read), POST (create), PUT/PATCH (replace/update), and DELETE (to delete a record), and respond with 405 Method Not Allowed if the requested method isn't appropriate for the requested resource.

### Processing

- Do not forget to turn the DEBUG mode OFF.
- Don't auto-increment IDs. Use UUIDs instead.
- Use a CDN for file uploads.
- If you are dealing with a huge amount of data, use Workers and Queues to process as much as possible in background and return response fast to avoid HTTP Blocking.
- If you are parsing XML files, make sure entity expansion is not enabled to avoid Billion Laughs/XML bomb via exponential entity expansion attack.
- If you are parsing XML files, make sure entity parsing is not enabled to avoid XXE (XML external entity attack).

### Output

- Send `X-Content-Type-Options: nosniff` header.
- Send `X-Frame-Options: deny` header.
- Send `Content-Security-Policy: default-src 'none'` header.
- Remove fingerprinting headers — `X-Powered-By`, `Server`, `X-AspNet-Version`, etc.
- Force content-type for your response. If you return `application/json`, then your content-type response is `application/json`.
- Don't return sensitive data like credentials, passwords, or security tokens.
- Return the proper status code according to the operation completed (e.g. 200 OK, 400 Bad Request, 401 Unauthorized, 405 Method Not Allowed, etc.).

### CI/CD

- Audit your design and implementation with unit/integration tests coverage.
- Use a code review process and disregard self-approval.
- Ensure that all components of your services are statically scanned by AV software before pushing to production, including vendor libraries and other dependencies.
- Design a rollback solution for deployments.
