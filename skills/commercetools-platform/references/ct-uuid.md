# commercetools UUID

**Q:** Is there any format that commercetools follow for the uuid's generated for resources? If the customer wants to use uuid as a unique identifier, would there be any chance that they could be same with any other non-commercetools systems because maybe we use the same source to generate the uuids? Is it a good practice to use uuid as a unique identifier (for example Order#) if they don't want to generate any on their own and instead use the uuid? Do we recycle these uuid? If yes, how often?

**Answer:** A UUID is a _universal_ unique identifier, that means it is safe to use it outside as well. They are not recycled but unique in space and time. The question is if they need this universal uniqueness for their use case and if they want to expose this unique identifier. E.g. if they would use that as an order number exposed to a customer it would probably not be wise.

Reference: https://docs.oracle.com/javase/7/docs/api/java/util/UUID.html

We generate them with the java UUID class.

---

**Q:** The uuid getting exposed to their customer - is the issue referring to "exposing the internal identifier with outside world" or some other vulnerability?

Staying with the order number example: A customer might have to call support and read the order number to identify it. If it was a uuid it would be unnecessary long and hard to read.

For customer facing identifiers you might want to have something that is easier to read and shorter.

---

**Q:** If commercetools customer asks, how do you generate the UUIDs, can we share above note with them?

Yes, it is safe to share with customers.
