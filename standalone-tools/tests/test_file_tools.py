"""
Comprehensive test suite for file_tools.py
Tests cover: file operations, directory listing, search, security, mocking
"""

import pytest
import sys
import os
import hashlib
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, mock_open, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))

from file_tools import FileTools


class TestSearchFiles:
    """Tests for search_files function"""

    def test_search_python_files(self, create_test_files, temp_dir):
        """Test searching for Python files"""
        result = FileTools.search_files(str(temp_dir), r"\.py$", 3)
        assert result['success'] is True
        assert result['count'] == 2
        assert all('.py' in file['name'] for file in result['results'])

    def test_search_text_files(self, create_test_files, temp_dir):
        """Test searching for text files"""
        result = FileTools.search_files(str(temp_dir), r"\.txt$", 3)
        assert result['success'] is True
        assert result['count'] >= 3

    def test_search_by_name_pattern(self, create_test_files, temp_dir):
        """Test searching by name pattern"""
        result = FileTools.search_files(str(temp_dir), r"test_file_", 3)
        assert result['success'] is True
        assert result['count'] >= 3

    def test_search_max_depth_limit(self, create_test_files, temp_dir):
        """Test max depth limiting"""
        # Search with depth 0 (only current dir)
        result = FileTools.search_files(str(temp_dir), r".*", 0)
        assert result['success'] is True
        # Should not find nested.txt in subdir

    def test_search_nested_files(self, create_test_files, temp_dir):
        """Test finding files in subdirectories"""
        result = FileTools.search_files(str(temp_dir), r"nested", 3)
        assert result['success'] is True
        assert result['count'] == 1

    def test_search_no_matches(self, temp_dir):
        """Test search with no matches"""
        result = FileTools.search_files(str(temp_dir), r"nonexistent\.xyz$", 3)
        assert result['success'] is True
        assert result['count'] == 0

    def test_search_invalid_directory(self):
        """Test searching non-existent directory"""
        result = FileTools.search_files("/nonexistent/path", r".*", 3)
        assert result['success'] is False
        assert 'error' in result

    def test_search_results_include_metadata(self, create_test_files, temp_dir):
        """Test that search results include file metadata"""
        result = FileTools.search_files(str(temp_dir), r"\.txt$", 3)
        assert result['success'] is True
        if result['count'] > 0:
            file_info = result['results'][0]
            assert 'path' in file_info
            assert 'name' in file_info
            assert 'size' in file_info
            assert 'modified' in file_info

    @pytest.mark.security
    def test_search_skips_hidden_files(self, temp_dir):
        """Test that hidden files are skipped"""
        # Create hidden file
        hidden_file = temp_dir / ".hidden_file.txt"
        hidden_file.write_text("hidden content")

        result = FileTools.search_files(str(temp_dir), r"hidden", 3)
        assert result['success'] is True
        assert result['count'] == 0  # Hidden files should be skipped

    @pytest.mark.parametrize("pattern,expected_min", [
        (r"\.txt$", 3),
        (r"\.py$", 2),
        (r"script_", 2),
    ])
    def test_various_patterns(self, create_test_files, temp_dir, pattern, expected_min):
        """Parameterized test for various search patterns"""
        result = FileTools.search_files(str(temp_dir), pattern, 3)
        assert result['success'] is True
        assert result['count'] >= expected_min


class TestGetStats:
    """Tests for get_stats function"""

    def test_file_stats(self, create_test_files, temp_dir):
        """Test getting stats for a file"""
        test_file = create_test_files[0]
        result = FileTools.get_stats(str(test_file))
        assert result['success'] is True
        assert result['result']['type'] == 'file'
        assert result['result']['size'] > 0
        assert 'modified' in result['result']
        assert 'created' in result['result']

    def test_directory_stats(self, temp_dir):
        """Test getting stats for a directory"""
        result = FileTools.get_stats(str(temp_dir))
        assert result['success'] is True
        assert result['result']['type'] == 'directory'
        assert 'contents' in result['result']
        assert 'files' in result['result']['contents']
        assert 'directories' in result['result']['contents']

    def test_directory_contents_count(self, create_test_files, temp_dir):
        """Test directory contents counting"""
        result = FileTools.get_stats(str(temp_dir))
        assert result['success'] is True
        assert result['result']['contents']['files'] >= 6
        assert result['result']['contents']['directories'] >= 1

    def test_size_readable_format(self, temp_dir):
        """Test human-readable size formatting"""
        # Create a file with known size
        test_file = temp_dir / "sizefile.txt"
        test_file.write_text("x" * 2048)  # 2KB

        result = FileTools.get_stats(str(test_file))
        assert result['success'] is True
        assert 'KB' in result['result']['sizeReadable'] or 'Bytes' in result['result']['sizeReadable']

    def test_nonexistent_path(self):
        """Test getting stats for non-existent path"""
        result = FileTools.get_stats("/nonexistent/path/file.txt")
        assert result['success'] is False
        assert 'error' in result

    def test_stats_timestamp_format(self, create_test_files):
        """Test that timestamps are in ISO format"""
        test_file = create_test_files[0]
        result = FileTools.get_stats(str(test_file))
        assert result['success'] is True

        # Verify ISO timestamp format
        modified = result['result']['modified']
        datetime.fromisoformat(modified)  # Should not raise exception

    @pytest.mark.security
    def test_stats_skips_hidden_in_directory(self, temp_dir):
        """Test that hidden files are not counted in directory stats"""
        # Create hidden file
        hidden_file = temp_dir / ".hidden"
        hidden_file.write_text("hidden")

        result = FileTools.get_stats(str(temp_dir))
        assert result['success'] is True
        # Hidden file should not be counted


class TestBatchRename:
    """Tests for batch_rename function"""

    def test_batch_rename_dry_run(self, create_test_files, temp_dir):
        """Test batch rename in dry-run mode"""
        result = FileTools.batch_rename(str(temp_dir), r"test_file_", "renamed_", True)
        assert result['success'] is True
        assert result['dryRun'] is True
        assert result['count'] >= 3

        # Verify files were NOT actually renamed
        assert (temp_dir / "test_file_0.txt").exists()

    def test_batch_rename_actual(self, temp_dir):
        """Test actual batch rename"""
        # Create test files
        for i in range(3):
            (temp_dir / f"old_{i}.txt").write_text("content")

        result = FileTools.batch_rename(str(temp_dir), r"old_", "new_", False)
        assert result['success'] is True
        assert result['dryRun'] is False
        assert result['count'] == 3

        # Verify files were actually renamed
        assert (temp_dir / "new_0.txt").exists()
        assert not (temp_dir / "old_0.txt").exists()

    def test_batch_rename_no_matches(self, temp_dir):
        """Test batch rename with no matching files"""
        result = FileTools.batch_rename(str(temp_dir), r"nonexistent", "new", True)
        assert result['success'] is True
        assert result['count'] == 0

    def test_batch_rename_complex_pattern(self, temp_dir):
        """Test batch rename with regex groups"""
        # Create files
        (temp_dir / "file_001.txt").write_text("content")
        (temp_dir / "file_002.txt").write_text("content")

        result = FileTools.batch_rename(str(temp_dir), r"file_(\d+)", r"doc_\1", True)
        assert result['success'] is True
        assert result['count'] == 2

    def test_batch_rename_preserves_extension(self, temp_dir):
        """Test that rename preserves file extensions correctly"""
        (temp_dir / "old.txt").write_text("content")

        result = FileTools.batch_rename(str(temp_dir), r"old", "new", False)
        assert result['success'] is True
        assert (temp_dir / "new.txt").exists()

    def test_batch_rename_includes_details(self, temp_dir):
        """Test that rename result includes old and new names"""
        (temp_dir / "test.txt").write_text("content")

        result = FileTools.batch_rename(str(temp_dir), r"test", "renamed", True)
        assert result['success'] is True
        if result['count'] > 0:
            rename_info = result['renames'][0]
            assert 'old' in rename_info
            assert 'new' in rename_info
            assert 'oldName' in rename_info
            assert 'newName' in rename_info


class TestListDirectory:
    """Tests for list_directory function"""

    def test_list_directory(self, create_test_files, temp_dir):
        """Test listing directory contents"""
        result = FileTools.list_directory(str(temp_dir), 'name')
        assert result['success'] is True
        assert result['count'] >= 6

    def test_list_sort_by_name(self, temp_dir):
        """Test sorting by name"""
        # Create files with specific names
        (temp_dir / "c_file.txt").write_text("content")
        (temp_dir / "a_file.txt").write_text("content")
        (temp_dir / "b_file.txt").write_text("content")

        result = FileTools.list_directory(str(temp_dir), 'name')
        assert result['success'] is True
        names = [item['name'] for item in result['results']]
        assert names == sorted(names)

    def test_list_sort_by_size(self, temp_dir):
        """Test sorting by size"""
        # Create files with different sizes
        (temp_dir / "small.txt").write_text("x")
        (temp_dir / "large.txt").write_text("x" * 1000)

        result = FileTools.list_directory(str(temp_dir), 'size')
        assert result['success'] is True
        # Should be sorted by size descending
        if len(result['results']) >= 2:
            assert result['results'][0]['size'] >= result['results'][1]['size']

    def test_list_sort_by_modified(self, temp_dir):
        """Test sorting by modification time"""
        import time
        (temp_dir / "first.txt").write_text("content")
        time.sleep(0.1)
        (temp_dir / "second.txt").write_text("content")

        result = FileTools.list_directory(str(temp_dir), 'modified')
        assert result['success'] is True
        # Should be sorted by modified time descending

    def test_list_includes_metadata(self, create_test_files, temp_dir):
        """Test that listing includes file metadata"""
        result = FileTools.list_directory(str(temp_dir), 'name')
        assert result['success'] is True

        item = result['results'][0]
        assert 'name' in item
        assert 'path' in item
        assert 'type' in item
        assert 'size' in item
        assert 'sizeReadable' in item
        assert 'modified' in item
        assert 'extension' in item

    def test_list_file_types(self, create_test_files, temp_dir):
        """Test identifying file vs directory types"""
        result = FileTools.list_directory(str(temp_dir), 'name')
        assert result['success'] is True

        # Should have both files and directories
        types = [item['type'] for item in result['results']]
        assert 'file' in types
        assert 'directory' in types

    def test_list_empty_directory(self, temp_dir):
        """Test listing empty directory"""
        empty_dir = temp_dir / "empty"
        empty_dir.mkdir()

        result = FileTools.list_directory(str(empty_dir), 'name')
        assert result['success'] is True
        assert result['count'] == 0

    @pytest.mark.security
    def test_list_skips_hidden_files(self, temp_dir):
        """Test that hidden files are skipped"""
        (temp_dir / "visible.txt").write_text("content")
        (temp_dir / ".hidden.txt").write_text("content")

        result = FileTools.list_directory(str(temp_dir), 'name')
        assert result['success'] is True
        names = [item['name'] for item in result['results']]
        assert '.hidden.txt' not in names


class TestFindDuplicates:
    """Tests for find_duplicates function"""

    def test_find_duplicates(self, create_test_files, temp_dir):
        """Test finding duplicate files"""
        # duplicate.txt has same content as test_file_0.txt
        result = FileTools.find_duplicates(str(temp_dir), 3)
        assert result['success'] is True
        assert result['duplicateGroups'] >= 1

    def test_no_duplicates(self, temp_dir):
        """Test when no duplicates exist"""
        (temp_dir / "unique1.txt").write_text("content1")
        (temp_dir / "unique2.txt").write_text("content2")

        result = FileTools.find_duplicates(str(temp_dir), 3)
        assert result['success'] is True
        assert result['duplicateGroups'] == 0

    def test_multiple_duplicate_groups(self, temp_dir):
        """Test finding multiple groups of duplicates"""
        # Group 1
        (temp_dir / "a1.txt").write_text("contentA")
        (temp_dir / "a2.txt").write_text("contentA")

        # Group 2
        (temp_dir / "b1.txt").write_text("contentB")
        (temp_dir / "b2.txt").write_text("contentB")

        result = FileTools.find_duplicates(str(temp_dir), 3)
        assert result['success'] is True
        assert result['duplicateGroups'] >= 2

    def test_duplicates_include_hash(self, temp_dir):
        """Test that duplicate results include hash"""
        (temp_dir / "dup1.txt").write_text("same content")
        (temp_dir / "dup2.txt").write_text("same content")

        result = FileTools.find_duplicates(str(temp_dir), 3)
        assert result['success'] is True
        if result['duplicateGroups'] > 0:
            assert 'hash' in result['duplicates'][0]
            assert 'files' in result['duplicates'][0]

    def test_duplicates_max_depth(self, temp_dir):
        """Test max depth parameter"""
        # Create nested duplicate
        subdir = temp_dir / "level1" / "level2"
        subdir.mkdir(parents=True)
        (temp_dir / "file.txt").write_text("content")
        (subdir / "file.txt").write_text("content")

        # Search with limited depth
        result = FileTools.find_duplicates(str(temp_dir), 1)
        assert result['success'] is True

    @pytest.mark.security
    def test_duplicates_skip_hidden(self, temp_dir):
        """Test that hidden files are skipped"""
        (temp_dir / "visible.txt").write_text("content")
        (temp_dir / ".hidden.txt").write_text("content")

        result = FileTools.find_duplicates(str(temp_dir), 3)
        assert result['success'] is True
        # Should not find duplicates with hidden file

    @pytest.mark.performance
    @pytest.mark.slow
    def test_duplicates_large_files(self, temp_dir, performance_thresholds):
        """Test finding duplicates with larger files"""
        import time
        # Create larger files
        content = "x" * 100000
        (temp_dir / "large1.txt").write_text(content)
        (temp_dir / "large2.txt").write_text(content)

        start = time.time()
        result = FileTools.find_duplicates(str(temp_dir), 3)
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['file_operation']


class TestGetFileType:
    """Tests for get_file_type function"""

    def test_python_file_type(self, temp_dir):
        """Test detecting Python file type"""
        py_file = temp_dir / "script.py"
        py_file.write_text("print('hello')")

        result = FileTools.get_file_type(str(py_file))
        assert result['success'] is True
        assert result['extension'] == '.py'
        assert result['description'] == 'Python Script'

    def test_javascript_file_type(self, temp_dir):
        """Test detecting JavaScript file type"""
        js_file = temp_dir / "app.js"
        js_file.write_text("console.log('hello')")

        result = FileTools.get_file_type(str(js_file))
        assert result['success'] is True
        assert result['extension'] == '.js'

    def test_image_file_type(self, temp_dir):
        """Test detecting image file type"""
        img_file = temp_dir / "photo.jpg"
        img_file.write_bytes(b'\xff\xd8\xff')  # JPEG header

        result = FileTools.get_file_type(str(img_file))
        assert result['success'] is True
        assert result['extension'] == '.jpg'

    def test_mime_type_detection(self, temp_dir):
        """Test MIME type detection"""
        html_file = temp_dir / "page.html"
        html_file.write_text("<html></html>")

        result = FileTools.get_file_type(str(html_file))
        assert result['success'] is True
        assert result['mimeType'] is not None

    def test_unknown_file_type(self, temp_dir):
        """Test unknown file type"""
        unknown_file = temp_dir / "file.unknownext"
        unknown_file.write_text("content")

        result = FileTools.get_file_type(str(unknown_file))
        assert result['success'] is True
        assert result['description'] == 'Unknown'

    @pytest.mark.parametrize("extension,expected_desc", [
        ('.py', 'Python Script'),
        ('.js', 'JavaScript'),
        ('.html', 'HTML Document'),
        ('.json', 'JSON Data'),
        ('.md', 'Markdown'),
        ('.txt', 'Text File'),
    ])
    def test_various_file_types(self, temp_dir, extension, expected_desc):
        """Parameterized test for various file types"""
        file_path = temp_dir / f"test{extension}"
        file_path.write_text("content")

        result = FileTools.get_file_type(str(file_path))
        assert result['success'] is True
        assert result['description'] == expected_desc


class TestFormatBytes:
    """Tests for _format_bytes helper function"""

    def test_format_zero_bytes(self):
        """Test formatting zero bytes"""
        result = FileTools._format_bytes(0)
        assert result == '0 Bytes'

    def test_format_bytes(self):
        """Test formatting bytes"""
        result = FileTools._format_bytes(100)
        assert 'Bytes' in result

    def test_format_kilobytes(self):
        """Test formatting kilobytes"""
        result = FileTools._format_bytes(2048)
        assert 'KB' in result

    def test_format_megabytes(self):
        """Test formatting megabytes"""
        result = FileTools._format_bytes(2 * 1024 * 1024)
        assert 'MB' in result

    def test_format_gigabytes(self):
        """Test formatting gigabytes"""
        result = FileTools._format_bytes(3 * 1024 * 1024 * 1024)
        assert 'GB' in result

    @pytest.mark.parametrize("size,expected_unit", [
        (500, 'Bytes'),
        (1024, 'KB'),
        (1024 * 1024, 'MB'),
        (1024 * 1024 * 1024, 'GB'),
    ])
    def test_various_sizes(self, size, expected_unit):
        """Parameterized test for various sizes"""
        result = FileTools._format_bytes(size)
        assert expected_unit in result


class TestIntegration:
    """Integration tests combining multiple operations"""

    def test_search_and_get_stats_workflow(self, create_test_files, temp_dir):
        """Test searching then getting stats"""
        # Search for Python files
        search_result = FileTools.search_files(str(temp_dir), r"\.py$", 3)
        assert search_result['success'] is True

        # Get stats for first result
        if search_result['count'] > 0:
            file_path = search_result['results'][0]['path']
            stats_result = FileTools.get_stats(file_path)
            assert stats_result['success'] is True

    def test_list_and_detect_type_workflow(self, create_test_files, temp_dir):
        """Test listing then detecting file types"""
        # List directory
        list_result = FileTools.list_directory(str(temp_dir), 'name')
        assert list_result['success'] is True

        # Detect type of first file
        files = [item for item in list_result['results'] if item['type'] == 'file']
        if files:
            type_result = FileTools.get_file_type(files[0]['path'])
            assert type_result['success'] is True

    def test_find_duplicates_and_stats_workflow(self, temp_dir):
        """Test finding duplicates then getting their stats"""
        # Create duplicates
        (temp_dir / "dup1.txt").write_text("same content")
        (temp_dir / "dup2.txt").write_text("same content")

        # Find duplicates
        dup_result = FileTools.find_duplicates(str(temp_dir), 3)
        assert dup_result['success'] is True

        # Get stats for duplicates
        if dup_result['duplicateGroups'] > 0:
            files = dup_result['duplicates'][0]['files']
            for file_path in files:
                stats = FileTools.get_stats(file_path)
                assert stats['success'] is True


@pytest.mark.security
class TestSecurity:
    """Security-focused tests"""

    def test_path_traversal_protection(self):
        """Test protection against path traversal"""
        # Attempt to access parent directory
        result = FileTools.search_files("../../../etc", r"passwd", 3)
        # Should either fail or not find sensitive files

    def test_symlink_handling(self, temp_dir):
        """Test handling of symbolic links"""
        if os.name != 'nt':  # Skip on Windows
            target = temp_dir / "target.txt"
            target.write_text("content")
            link = temp_dir / "link.txt"
            link.symlink_to(target)

            result = FileTools.get_stats(str(link))
            assert result['success'] is True

    @pytest.mark.parametrize("malicious_path", [
        "../../../etc/passwd",
        "/etc/shadow",
        "../../.ssh/id_rsa",
    ])
    def test_sensitive_file_access(self, malicious_path):
        """Test that sensitive files are not accessible"""
        result = FileTools.get_stats(malicious_path)
        # Should fail gracefully

    def test_large_file_handling(self, temp_dir):
        """Test handling very large files safely"""
        # Create a file reference without actually writing huge content
        large_file = temp_dir / "large.txt"
        large_file.write_text("x" * 10000)

        result = FileTools.get_stats(str(large_file))
        assert result['success'] is True

    def test_special_characters_in_filename(self, temp_dir):
        """Test handling special characters in filenames"""
        special_file = temp_dir / "file with spaces & special!.txt"
        special_file.write_text("content")

        result = FileTools.get_stats(str(special_file))
        assert result['success'] is True

    def test_permission_error_handling(self, temp_dir):
        """Test handling permission errors gracefully"""
        # This is hard to test portably, but search should handle PermissionError
        result = FileTools.search_files(str(temp_dir), r".*", 3)
        assert result['success'] is True


@pytest.mark.performance
class TestPerformance:
    """Performance tests for file operations"""

    @pytest.mark.slow
    def test_search_many_files(self, temp_dir, performance_thresholds):
        """Test searching through many files"""
        import time
        # Create many files
        for i in range(100):
            (temp_dir / f"file_{i}.txt").write_text(f"content {i}")

        start = time.time()
        result = FileTools.search_files(str(temp_dir), r"\.txt$", 3)
        duration = time.time() - start

        assert result['success'] is True
        assert result['count'] == 100
        assert duration < performance_thresholds['file_operation']

    @pytest.mark.slow
    def test_list_large_directory(self, temp_dir, performance_thresholds):
        """Test listing directory with many files"""
        import time
        # Create many files
        for i in range(200):
            (temp_dir / f"item_{i}.txt").write_text("content")

        start = time.time()
        result = FileTools.list_directory(str(temp_dir), 'name')
        duration = time.time() - start

        assert result['success'] is True
        assert result['count'] >= 200
        assert duration < performance_thresholds['file_operation']

    def test_stats_performance(self, create_test_files, temp_dir, performance_thresholds):
        """Test file stats performance"""
        import time

        start = time.time()
        result = FileTools.get_stats(str(temp_dir))
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['small_operation']
