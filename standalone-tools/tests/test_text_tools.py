"""
Comprehensive test suite for text_tools.py
Tests cover: unit tests, integration tests, edge cases, security, and performance
"""

import pytest
import sys
import json
import hashlib
import base64
import urllib.parse
import html
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from text_tools import TextTools


class TestRegexMatch:
    """Tests for regex_match function"""

    def test_simple_match(self):
        """Test basic regex matching"""
        result = TextTools.regex_match("hello world", r"world")
        assert result['success'] is True
        assert result['count'] == 1
        assert result['matches'][0]['match'] == 'world'
        assert result['matches'][0]['index'] == 6

    def test_multiple_matches(self):
        """Test finding multiple matches"""
        result = TextTools.regex_match("test test test", r"test")
        assert result['success'] is True
        assert result['count'] == 3

    def test_capture_groups(self):
        """Test regex with capture groups"""
        result = TextTools.regex_match("John: 30, Jane: 25", r"(\w+): (\d+)")
        assert result['success'] is True
        assert result['count'] == 2
        assert result['matches'][0]['groups'] == ['John', '30']
        assert result['matches'][1]['groups'] == ['Jane', '25']

    def test_case_insensitive_match(self):
        """Test case-insensitive matching with flags"""
        import re
        result = TextTools.regex_match("HELLO world", r"hello", re.IGNORECASE)
        assert result['success'] is True
        assert result['count'] == 1

    def test_no_matches(self):
        """Test when pattern doesn't match"""
        result = TextTools.regex_match("hello", r"goodbye")
        assert result['success'] is True
        assert result['count'] == 0
        assert result['matches'] == []

    def test_empty_string(self):
        """Test matching against empty string"""
        result = TextTools.regex_match("", r"test")
        assert result['success'] is True
        assert result['count'] == 0

    def test_invalid_regex(self):
        """Test with invalid regex pattern"""
        result = TextTools.regex_match("test", r"[invalid(")
        assert result['success'] is False
        assert 'error' in result

    @pytest.mark.security
    def test_regex_dos_protection(self):
        """Test protection against ReDoS attacks"""
        # Pathological regex that could cause exponential backtracking
        result = TextTools.regex_match("a" * 20 + "!", r"(a+)+b")
        # Should complete without hanging (timeout handled by pytest)
        assert 'success' in result

    @pytest.mark.parametrize("text,pattern,expected_count", [
        ("abc123def456", r"\d+", 2),
        ("test@example.com", r"\S+@\S+", 1),
        ("IPv4: 192.168.1.1", r"\d+\.\d+\.\d+\.\d+", 1),
        ("", r".*", 1),  # Empty string matches .* once
    ])
    def test_various_patterns(self, text, pattern, expected_count):
        """Parameterized test for various patterns"""
        result = TextTools.regex_match(text, pattern)
        assert result['success'] is True
        assert result['count'] == expected_count


class TestRegexReplace:
    """Tests for regex_replace function"""

    def test_simple_replace(self):
        """Test basic regex replacement"""
        result = TextTools.regex_replace("hello world", r"world", "universe")
        assert result['success'] is True
        assert result['result'] == "hello universe"
        assert result['changed'] is True

    def test_no_change(self):
        """Test when pattern doesn't match"""
        result = TextTools.regex_replace("hello", r"goodbye", "farewell")
        assert result['success'] is True
        assert result['changed'] is False

    def test_backreferences(self):
        """Test replacement with backreferences"""
        result = TextTools.regex_replace("John Doe", r"(\w+) (\w+)", r"\2, \1")
        assert result['success'] is True
        assert result['result'] == "Doe, John"

    def test_multiple_replacements(self):
        """Test replacing multiple occurrences"""
        result = TextTools.regex_replace("foo bar foo", r"foo", "baz")
        assert result['success'] is True
        assert result['result'] == "baz bar baz"

    def test_empty_replacement(self):
        """Test removing matched text"""
        result = TextTools.regex_replace("hello123world", r"\d+", "")
        assert result['success'] is True
        assert result['result'] == "helloworld"

    def test_invalid_regex(self):
        """Test with invalid pattern"""
        result = TextTools.regex_replace("test", r"[invalid(", "replacement")
        assert result['success'] is False
        assert 'error' in result


class TestHashText:
    """Tests for hash_text function"""

    def test_sha256_hash(self):
        """Test SHA-256 hashing"""
        result = TextTools.hash_text("password", "sha256")
        assert result['success'] is True
        assert result['algorithm'] == 'sha256'
        assert len(result['hash']) == 64  # SHA-256 produces 64 hex chars

    def test_md5_hash(self):
        """Test MD5 hashing"""
        result = TextTools.hash_text("test", "md5")
        assert result['success'] is True
        assert result['algorithm'] == 'md5'
        assert len(result['hash']) == 32

    def test_sha1_hash(self):
        """Test SHA-1 hashing"""
        result = TextTools.hash_text("test", "sha1")
        assert result['success'] is True
        assert len(result['hash']) == 40

    def test_sha512_hash(self):
        """Test SHA-512 hashing"""
        result = TextTools.hash_text("test", "sha512")
        assert result['success'] is True
        assert len(result['hash']) == 128

    def test_deterministic_hash(self):
        """Test that same input produces same hash"""
        result1 = TextTools.hash_text("consistent", "sha256")
        result2 = TextTools.hash_text("consistent", "sha256")
        assert result1['hash'] == result2['hash']

    def test_different_inputs_different_hashes(self):
        """Test that different inputs produce different hashes"""
        result1 = TextTools.hash_text("input1", "sha256")
        result2 = TextTools.hash_text("input2", "sha256")
        assert result1['hash'] != result2['hash']

    def test_invalid_algorithm(self):
        """Test with invalid hash algorithm"""
        result = TextTools.hash_text("test", "invalid_algo")
        assert result['success'] is False
        assert 'error' in result

    def test_empty_string_hash(self):
        """Test hashing empty string"""
        result = TextTools.hash_text("", "sha256")
        assert result['success'] is True
        assert result['hash'] is not None

    def test_unicode_hash(self):
        """Test hashing unicode text"""
        result = TextTools.hash_text("こんにちは", "sha256")
        assert result['success'] is True
        assert len(result['hash']) == 64


class TestEncodeDecode:
    """Tests for encode_decode function"""

    def test_base64_encode(self):
        """Test Base64 encoding"""
        result = TextTools.encode_decode("Hello World", "encode", "base64")
        assert result['success'] is True
        assert result['result'] == base64.b64encode(b"Hello World").decode()

    def test_base64_decode(self):
        """Test Base64 decoding"""
        encoded = base64.b64encode(b"Hello World").decode()
        result = TextTools.encode_decode(encoded, "decode", "base64")
        assert result['success'] is True
        assert result['result'] == "Hello World"

    def test_base64_roundtrip(self):
        """Test encoding then decoding returns original"""
        original = "Test message 123!@#"
        encoded = TextTools.encode_decode(original, "encode", "base64")
        decoded = TextTools.encode_decode(encoded['result'], "decode", "base64")
        assert decoded['result'] == original

    def test_hex_encode(self):
        """Test hex encoding"""
        result = TextTools.encode_decode("ABC", "encode", "hex")
        assert result['success'] is True
        assert result['result'] == "414243"

    def test_hex_decode(self):
        """Test hex decoding"""
        result = TextTools.encode_decode("414243", "decode", "hex")
        assert result['success'] is True
        assert result['result'] == "ABC"

    def test_url_encode(self):
        """Test URL encoding"""
        result = TextTools.encode_decode("hello world", "encode", "url")
        assert result['success'] is True
        assert result['result'] == "hello%20world"

    def test_url_decode(self):
        """Test URL decoding"""
        result = TextTools.encode_decode("hello%20world", "decode", "url")
        assert result['success'] is True
        assert result['result'] == "hello world"

    def test_html_encode(self):
        """Test HTML encoding"""
        result = TextTools.encode_decode("<script>alert('XSS')</script>", "encode", "html")
        assert result['success'] is True
        assert "&lt;" in result['result']
        assert "&gt;" in result['result']

    def test_html_decode(self):
        """Test HTML decoding"""
        result = TextTools.encode_decode("&lt;div&gt;", "decode", "html")
        assert result['success'] is True
        assert result['result'] == "<div>"

    def test_invalid_format(self):
        """Test with invalid format"""
        result = TextTools.encode_decode("test", "encode", "invalid")
        assert result['success'] is False
        assert 'error' in result

    def test_invalid_base64_decode(self):
        """Test decoding invalid Base64"""
        result = TextTools.encode_decode("not_valid_base64!@#", "decode", "base64")
        assert result['success'] is False

    @pytest.mark.security
    def test_encode_special_characters(self, malicious_inputs):
        """Test encoding various special characters"""
        for name, malicious_string in malicious_inputs.items():
            result = TextTools.encode_decode(malicious_string, "encode", "base64")
            assert result['success'] is True


class TestAnalyzeText:
    """Tests for analyze_text function"""

    def test_all_metrics(self, sample_text):
        """Test analyzing all text metrics"""
        result = TextTools.analyze_text(sample_text, ['all'])
        assert result['success'] is True
        assert 'characters' in result['metrics']
        assert 'words' in result['metrics']
        assert 'lines' in result['metrics']
        assert 'sentences' in result['metrics']
        assert 'paragraphs' in result['metrics']
        assert 'readingTimeMinutes' in result['metrics']

    def test_specific_metrics(self, sample_text):
        """Test analyzing specific metrics"""
        result = TextTools.analyze_text(sample_text, ['chars', 'words'])
        assert result['success'] is True
        assert 'characters' in result['metrics']
        assert 'words' in result['metrics']
        assert 'lines' not in result['metrics']

    def test_character_count(self):
        """Test character counting"""
        result = TextTools.analyze_text("Hello", ['chars'])
        assert result['metrics']['characters'] == 5

    def test_character_count_no_spaces(self):
        """Test character counting without spaces"""
        result = TextTools.analyze_text("Hello World", ['chars'])
        assert result['metrics']['charactersNoSpaces'] == 10

    def test_word_count(self):
        """Test word counting"""
        result = TextTools.analyze_text("one two three", ['words'])
        assert result['metrics']['words'] == 3

    def test_line_count(self):
        """Test line counting"""
        result = TextTools.analyze_text("line1\nline2\nline3", ['lines'])
        assert result['metrics']['lines'] == 3

    def test_sentence_count(self):
        """Test sentence counting"""
        text = "First sentence. Second sentence! Third sentence?"
        result = TextTools.analyze_text(text, ['sentences'])
        assert result['metrics']['sentences'] == 3

    def test_paragraph_count(self):
        """Test paragraph counting"""
        text = "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3."
        result = TextTools.analyze_text(text, ['paragraphs'])
        assert result['metrics']['paragraphs'] == 3

    def test_reading_time(self):
        """Test reading time calculation"""
        # 200 words should be 1 minute
        text = " ".join(["word"] * 200)
        result = TextTools.analyze_text(text, ['readingTime'])
        assert result['metrics']['readingTimeMinutes'] == 1

    def test_empty_text(self):
        """Test analyzing empty text"""
        result = TextTools.analyze_text("", ['all'])
        assert result['success'] is True
        assert result['metrics']['characters'] == 0

    def test_unicode_text(self):
        """Test analyzing unicode text"""
        result = TextTools.analyze_text("こんにちは 世界", ['all'])
        assert result['success'] is True
        assert result['metrics']['words'] == 2


class TestDiffText:
    """Tests for diff_text function"""

    def test_identical_texts(self):
        """Test diffing identical texts"""
        result = TextTools.diff_text("same", "same")
        assert result['success'] is True
        assert result['identical'] is True
        assert len(result['differences']) == 0

    def test_different_texts_unified(self):
        """Test diffing different texts in unified format"""
        result = TextTools.diff_text("old text", "new text", "unified")
        assert result['success'] is True
        assert result['identical'] is False
        assert len(result['differences']) > 0

    def test_different_texts_json(self):
        """Test diffing different texts in JSON format"""
        result = TextTools.diff_text("old", "new", "json")
        assert result['success'] is True
        assert isinstance(result['differences'], list)
        if result['differences']:
            assert 'line' in result['differences'][0]

    def test_multiline_diff(self):
        """Test diffing multiline texts"""
        text1 = "line1\nline2\nline3"
        text2 = "line1\nmodified\nline3"
        result = TextTools.diff_text(text1, text2)
        assert result['success'] is True
        assert result['identical'] is False

    def test_empty_comparison(self):
        """Test diffing with empty strings"""
        result = TextTools.diff_text("", "")
        assert result['success'] is True
        assert result['identical'] is True


class TestExtractUrls:
    """Tests for extract_urls function"""

    def test_extract_single_url(self):
        """Test extracting a single URL"""
        result = TextTools.extract_urls("Visit https://example.com")
        assert result['success'] is True
        assert result['count'] == 1
        assert "https://example.com" in result['urls']

    def test_extract_multiple_urls(self, sample_text):
        """Test extracting multiple URLs"""
        result = TextTools.extract_urls(sample_text)
        assert result['success'] is True
        assert result['count'] >= 1

    def test_extract_http_and_https(self):
        """Test extracting both HTTP and HTTPS URLs"""
        text = "http://example.com and https://secure.example.org"
        result = TextTools.extract_urls(text)
        assert result['success'] is True
        assert result['count'] == 2

    def test_extract_url_with_path(self):
        """Test extracting URL with path and query params"""
        text = "Go to https://example.com/path/to/page?key=value&other=123"
        result = TextTools.extract_urls(text)
        assert result['success'] is True
        assert result['count'] == 1

    def test_no_urls(self):
        """Test when no URLs present"""
        result = TextTools.extract_urls("No URLs here")
        assert result['success'] is True
        assert result['count'] == 0

    def test_url_with_subdomain(self):
        """Test extracting URL with subdomain"""
        result = TextTools.extract_urls("Visit https://www.example.com")
        assert result['success'] is True
        assert result['count'] == 1


class TestExtractEmails:
    """Tests for extract_emails function"""

    def test_extract_single_email(self):
        """Test extracting a single email"""
        result = TextTools.extract_emails("Contact test@example.com")
        assert result['success'] is True
        assert result['count'] == 1
        assert "test@example.com" in result['emails']

    def test_extract_multiple_emails(self, sample_text):
        """Test extracting multiple emails"""
        result = TextTools.extract_emails(sample_text)
        assert result['success'] is True
        assert result['count'] >= 2

    def test_email_with_subdomain(self):
        """Test extracting email with subdomain"""
        result = TextTools.extract_emails("Email: user@mail.example.com")
        assert result['success'] is True
        assert result['count'] == 1

    def test_email_with_plus_sign(self):
        """Test extracting email with plus addressing"""
        result = TextTools.extract_emails("Send to user+tag@example.com")
        assert result['success'] is True
        assert result['count'] == 1

    def test_no_emails(self):
        """Test when no emails present"""
        result = TextTools.extract_emails("No emails here")
        assert result['success'] is True
        assert result['count'] == 0

    def test_email_with_numbers(self):
        """Test extracting email with numbers"""
        result = TextTools.extract_emails("Contact user123@example456.com")
        assert result['success'] is True
        assert result['count'] == 1


class TestIntegration:
    """Integration tests combining multiple operations"""

    def test_hash_and_encode_workflow(self):
        """Test hashing then encoding the result"""
        # Hash a password
        hash_result = TextTools.hash_text("password123", "sha256")
        assert hash_result['success'] is True

        # Encode the hash
        encode_result = TextTools.encode_decode(hash_result['hash'], "encode", "base64")
        assert encode_result['success'] is True

    def test_extract_analyze_workflow(self, sample_text):
        """Test extracting URLs then analyzing the text"""
        # Extract URLs
        url_result = TextTools.extract_urls(sample_text)
        assert url_result['success'] is True

        # Analyze the same text
        analysis_result = TextTools.analyze_text(sample_text)
        assert analysis_result['success'] is True

    def test_regex_replace_and_diff_workflow(self):
        """Test replacing text with regex then diffing"""
        original = "hello world"
        replace_result = TextTools.regex_replace(original, r"world", "universe")
        assert replace_result['success'] is True

        diff_result = TextTools.diff_text(original, replace_result['result'])
        assert diff_result['success'] is True
        assert diff_result['identical'] is False


@pytest.mark.performance
class TestPerformance:
    """Performance tests for text operations"""

    @pytest.mark.slow
    def test_large_text_analysis(self, performance_thresholds):
        """Test analyzing very large text"""
        import time
        large_text = "word " * 100000  # 100k words

        start = time.time()
        result = TextTools.analyze_text(large_text, ['words', 'chars'])
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['large_operation']

    @pytest.mark.slow
    def test_many_regex_matches(self, performance_thresholds):
        """Test regex matching with many results"""
        import time
        text = "test " * 10000

        start = time.time()
        result = TextTools.regex_match(text, r"test")
        duration = time.time() - start

        assert result['success'] is True
        assert result['count'] == 10000
        assert duration < performance_thresholds['large_operation']

    def test_hash_performance(self, performance_thresholds):
        """Test hashing performance"""
        import time
        text = "x" * 100000

        start = time.time()
        result = TextTools.hash_text(text, "sha256")
        duration = time.time() - start

        assert result['success'] is True
        assert duration < performance_thresholds['medium_operation']


@pytest.mark.security
class TestSecurity:
    """Security-focused tests"""

    def test_sql_injection_in_regex(self, malicious_inputs):
        """Test that SQL injection attempts are handled safely"""
        result = TextTools.regex_match(
            malicious_inputs['sql_injection'],
            r".*"
        )
        assert result['success'] is True

    def test_xss_encoding(self, malicious_inputs):
        """Test XSS script encoding"""
        result = TextTools.encode_decode(
            malicious_inputs['xss'],
            "encode",
            "html"
        )
        assert result['success'] is True
        assert "<script>" not in result['result']
        assert "&lt;script&gt;" in result['result']

    def test_path_traversal_in_text(self, malicious_inputs):
        """Test handling path traversal attempts"""
        result = TextTools.analyze_text(malicious_inputs['path_traversal'])
        assert result['success'] is True

    def test_command_injection_detection(self, malicious_inputs):
        """Test detecting command injection patterns"""
        result = TextTools.regex_match(
            malicious_inputs['command_injection'],
            r"[;&|]"
        )
        assert result['success'] is True
        assert result['count'] > 0

    def test_buffer_overflow_handling(self, malicious_inputs):
        """Test handling very long inputs"""
        result = TextTools.hash_text(malicious_inputs['buffer_overflow'])
        assert result['success'] is True

    def test_null_byte_injection(self, malicious_inputs):
        """Test handling null byte injection"""
        result = TextTools.encode_decode(
            malicious_inputs['null_byte'],
            "encode",
            "base64"
        )
        assert result['success'] is True


class TestEdgeCases:
    """Edge case tests"""

    def test_edge_case_strings(self, edge_case_strings):
        """Test various edge case strings"""
        for name, text in edge_case_strings.items():
            # Each function should handle edge cases gracefully
            hash_result = TextTools.hash_text(text, "sha256")
            assert hash_result['success'] is True

            analyze_result = TextTools.analyze_text(text)
            assert analyze_result['success'] is True

    def test_unicode_emoji(self):
        """Test handling unicode emoji"""
        text = "Hello 👋 World 🌍"
        result = TextTools.analyze_text(text)
        assert result['success'] is True

    def test_rtl_text(self):
        """Test right-to-left text"""
        text = "مرحبا بالعالم"
        result = TextTools.analyze_text(text)
        assert result['success'] is True

    def test_mixed_encodings(self):
        """Test text with mixed character encodings"""
        text = "English 中文 日本語 한국어 العربية"
        result = TextTools.analyze_text(text)
        assert result['success'] is True
