# Images

## What Formats Are Supported?

JPEG, PNG, and GIF.

## Can We Upload Video Assets as Well?

Videos cannot be uploaded directly to Merchant Center, but you can use them with commercetools as **assets**.

Reference: https://docs.commercetools.com/tutorials/assets

## Are Image Sizes Set or Adjustable?

Image sizes are **not adjustable**. Please review the attached link for more information on the set sizes.

Reference: https://docs.commercetools.com/api/projects/products#image

## Do Images Auto-Assign?

Images can be assigned using the public APIs and the Merchant Center.

To assign images via Merchant Center, visit the product page and add each image manually to the variant.

Relevant API endpoints:
- Move image to position: https://docs.commercetools.com/api/projects/products#move-image-to-position
- Add external image: https://docs.commercetools.com/api/projects/products#add-external-image
- Remove image: https://docs.commercetools.com/api/projects/products#remove-image
- Set image label: https://docs.commercetools.com/api/projects/products#set-image-label

## In the Event That an Existing Image Is Replaced with a New Image, How Quickly Is the Existing Image Expired Within the CDN?

To ensure that new images on the storefront are not affected by cached older versions, commercetools always adds a **random suffix to the file names** of images. Therefore, a newly processed image should be **immediately available** without CDN cache conflicts.

## What Is the Max Canvas Dimension Size per Image (Large/Medium/Small)? Not File Size.

The sRGB resolution settings (pixels per inch) have a trade-off between quality and file size. For web, the recommendation is to stick to **72 pixels/inch**. Testing has shown that an image of **9000×6750 pixels (9.6 MB)** uploads successfully.

## Can You Confirm Bulk Uploading Is Possible? How Many Images at Once?

Bulk uploading is supported, though specific limits on simultaneous uploads should be validated based on your project configuration and Merchant Center version.

## How Does the Downstream Cropping of an Image Work?

This depends on your front-end solution and how it is configured. The commercetools platform stores images at the dimensions they are uploaded; cropping, resizing, and focal-point decisions are handled by the front-end or an intermediary image transformation service.

## Can the Container of Image Size Become a Rectangle for Different Viewports or Does It Have to Be a Square?

It is certainly possible to use rectangular containers. This would depend on the configuration of whatever front-end solution is in place and the configurations of that system. The platform itself does not enforce square dimensions.
