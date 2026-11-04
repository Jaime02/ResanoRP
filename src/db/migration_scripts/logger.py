import logging
from pathlib import Path

from tqdm import tqdm

LOG_PATH = Path(__file__).parent.parent / "migration.log"


class TqdmHandler(logging.Handler):
    def emit(self, record: logging.LogRecord):
        tqdm.write(self.format(record))


logger = logging.getLogger("migration")
logger.setLevel(logging.INFO)

file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(module)s] %(message)s"))
logger.addHandler(file_handler)

console_handler = TqdmHandler()
console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))
logger.addHandler(console_handler)


def clear_log():
    file_handler.close()
    LOG_PATH.write_text("", encoding="utf-8")
