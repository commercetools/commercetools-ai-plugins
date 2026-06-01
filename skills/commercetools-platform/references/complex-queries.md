# Complex Queries with OR and Negation

**Q: How to approach complex queries that include OR and Negation, for example:**

**Not in A_Specific_Category**

**AND**

**Attribute A = 5**

**AND**

**( Attribute B = True OR inventory = 0 OR No Inventory records )**

**A:** Today, product projection search does not support this type of complex queries. This can be achieved with product projection query however it may be too slow. Unless the volume of products is small and this can be handled as a product projection query the recommendation is to split this into a number of queries mostly using query projection search. The best approach is to run three queries for each one of the "OR" conditions and for each record check the rest of the condition and check if it meets them then it should be considered. A better approach is to store the results of each one of the "OR" queries in an external DB to be used later on to retrieve the relevant products and check the rest of the conditions, this is useful specially if some of the "OR" conditions are not tested against products but instead against inventory or prices.
