import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import PageParser, public_target, fetch_page

class PageReaderTests(unittest.TestCase):
    def test_extract_metadata(self):
        parser = PageParser()
        parser.feed('<title>Fallback</title><meta content="A &amp; B" property="og:title"><meta name="description" content="A design tool"><script>Ignore this video text</script><h1>Sketch diagrams</h1><p>A design tool for making wireframes and prototypes with your team.</p>')
        page = parser.result()
        self.assertEqual(page['title'], 'A & B')
        self.assertEqual(page['description'], 'A design tool')
        self.assertNotIn('Ignore', page['text'])
        self.assertEqual(page['headings'], ['Sketch diagrams'])
        self.assertTrue(page['excerpt'])

    def test_reject_private_and_loopback(self):
        for address in ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','::1']:
            with self.subTest(address=address), patch('server.socket.getaddrinfo',return_value=[(2,1,6,'',(address,80))]):
                with self.assertRaises(ValueError): public_target('http://internal.example/')

    def test_reject_credentials_ports_and_non_web_schemes(self):
        for url in ['file:///etc/passwd','https://name:secret@example.com','http://example.com:8000']:
            with self.assertRaises(ValueError): public_target(url)

    def test_redirect_to_private_target_is_revalidated(self):
        connection = MagicMock()
        response = connection.getresponse.return_value
        response.status = 302
        response.getheader.return_value = 'http://127.0.0.1/secret'
        public = (urlsplit('http://example.com/'), 80, '93.184.216.34')
        with patch('server.public_target', side_effect=[public, ValueError('Private address')]) as validate, patch('server.http.client.HTTPConnection', return_value=connection), patch('server.socket.create_connection'):
            with self.assertRaisesRegex(ValueError, 'Private'): fetch_page('http://example.com/')
            self.assertEqual(validate.call_args_list[1].args[0], 'http://127.0.0.1/secret')
            self.assertEqual(connection.request.call_count, 1)

if __name__ == '__main__': unittest.main()
