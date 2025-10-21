from pathlib import Path

from setuptools import setup

BASE_DIR = Path(__file__).parent.resolve()

setup(
    name="composio-myprovider",
    version="0.1.0",
    description="Sample Composio provider showcasing non-agentic and agentic integrations.",
    long_description=(BASE_DIR / "README.md").read_text(encoding="utf-8") if (BASE_DIR / "README.md").exists() else "",
    long_description_content_type="text/markdown",
    packages=["composio_myprovider"],
    package_data={"composio_myprovider": ["py.typed"]},
    python_requires=">=3.11",
)
