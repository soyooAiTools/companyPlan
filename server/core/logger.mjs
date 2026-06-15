export const logger = {
  info(message, metadata = undefined) {
    if (metadata === undefined) {
      console.info(message);
      return;
    }
    console.info(message, metadata);
  },
  error(error) {
    console.error(error);
  },
};
