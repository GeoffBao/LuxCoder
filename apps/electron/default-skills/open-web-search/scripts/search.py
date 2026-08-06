#!/usr/bin/env python3
"""
Open Web Search - Multi-source search using free APIs
Supports: DuckDuckGo, arXiv, GitHub, Wikipedia
"""

import requests
import json
import time
from urllib.parse import quote
from typing import List, Dict, Optional

class DuckDuckGoSearch:
    """Search using DuckDuckGo (free, no API key)"""
    
    def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """
        Search DuckDuckGo
        Note: Uses HTML scraping as DDG doesn't have an official API
        """
        try:
            from duckduckgo_search import DDGS
            
            with DDGS() as ddgs:
                results = []
                for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                    if i >= max_results:
                        break
                    results.append({
                        'title': r.get('title', ''),
                        'url': r.get('href', ''),
                        'snippet': r.get('body', ''),
                        'source': 'DuckDuckGo'
                    })
                return results
        except ImportError:
            print("⚠️  duckduckgo-search not installed. Install with: uv pip install duckduckgo-search")
            return []
        except Exception as e:
            print(f"⚠️  DuckDuckGo search error: {e}")
            return []

class ArxivSearch:
    """Search arXiv papers (free, no API key)"""
    
    BASE_URL = "http://export.arxiv.org/api/query"
    
    def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search arXiv papers"""
        try:
            params = {
                'search_query': f'all:{query}',
                'start': 0,
                'max_results': max_results,
                'sortBy': 'submittedDate',
                'sortOrder': 'descending'
            }
            
            response = requests.get(self.BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            
            # Parse Atom feed
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response.content)
            
            # Define namespaces
            ns = {
                'atom': 'http://www.w3.org/2005/Atom',
                'arxiv': 'http://arxiv.org/schemas/atom'
            }
            
            results = []
            for entry in root.findall('atom:entry', ns):
                paper = {
                    'title': entry.find('atom:title', ns).text if entry.find('atom:title', ns) is not None else '',
                    'authors': [author.find('atom:name', ns).text for author in entry.findall('atom:author', ns)],
                    'summary': entry.find('atom:summary', ns).text if entry.find('atom:summary', ns) is not None else '',
                    'published': entry.find('atom:published', ns).text if entry.find('atom:published', ns) is not None else '',
                    'arxiv_id': entry.find('atom:id', ns).text.split('/')[-1] if entry.find('atom:id', ns) is not None else '',
                    'pdf_url': '',
                    'source': 'arXiv'
                }
                
                # Get PDF link
                for link in entry.findall('atom:link', ns):
                    if link.get('title') == 'pdf':
                        paper['pdf_url'] = link.get('href', '')
                
                results.append(paper)
            
            return results
            
        except Exception as e:
            print(f"⚠️  arXiv search error: {e}")
            return []

class GitHubSearch:
    """Search GitHub repositories (free, higher limit with token)"""
    
    BASE_URL = "https://api.github.com/search/repositories"
    
    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.headers = {}
        if token:
            self.headers['Authorization'] = f'token {token}'
    
    def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search GitHub repositories"""
        try:
            params = {
                'q': query,
                'sort': 'stars',
                'order': 'desc',
                'per_page': max_results
            }
            
            response = requests.get(self.BASE_URL, params=params, headers=self.headers, timeout=30)
            
            if response.status_code == 403:
                print("⚠️  GitHub API rate limit exceeded. Consider setting GITHUB_TOKEN.")
                return []
            
            response.raise_for_status()
            data = response.json()
            
            results = []
            for item in data.get('items', []):
                repo = {
                    'name': item.get('full_name', ''),
                    'description': item.get('description', ''),
                    'url': item.get('html_url', ''),
                    'stars': item.get('stargazers_count', 0),
                    'forks': item.get('forks_count', 0),
                    'language': item.get('language', ''),
                    'updated': item.get('updated_at', ''),
                    'source': 'GitHub'
                }
                results.append(repo)
            
            return results
            
        except Exception as e:
            print(f"⚠️  GitHub search error: {e}")
            return []

class WikipediaSearch:
    """Search Wikipedia (free, no API key)"""
    
    BASE_URL = "https://en.wikipedia.org/w/api.php"
    
    def search(self, query: str) -> Optional[Dict]:
        """Search Wikipedia for a topic"""
        try:
            # Search for page
            search_params = {
                'action': 'query',
                'list': 'search',
                'srsearch': query,
                'format': 'json',
                'srlimit': 1
            }
            
            response = requests.get(self.BASE_URL, params=search_params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if not data['query']['search']:
                return None
            
            page_title = data['query']['search'][0]['title']
            
            # Get page content
            content_params = {
                'action': 'query',
                'prop': 'extracts',
                'exintro': True,
                'explaintext': True,
                'titles': page_title,
                'format': 'json'
            }
            
            response = requests.get(self.BASE_URL, params=content_params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            pages = data['query']['pages']
            page = list(pages.values())[0]
            
            return {
                'title': page.get('title', ''),
                'extract': page.get('extract', ''),
                'url': f"https://en.wikipedia.org/wiki/{quote(page_title.replace(' ', '_'))}",
                'source': 'Wikipedia'
            }
            
        except Exception as e:
            print(f"⚠️  Wikipedia search error: {e}")
            return None

def multi_search(query: str, sources: List[str] = None, max_results: int = 10) -> Dict:
    """
    Search multiple sources and aggregate results
    
    Args:
        query: Search query
        sources: List of sources to search ['ddg', 'arxiv', 'github', 'wiki']
        max_results: Max results per source
    
    Returns:
        Dictionary with results from each source
    """
    if sources is None:
        sources = ['ddg', 'arxiv', 'github']
    
    results = {}
    
    if 'ddg' in sources:
        print("🔍 Searching DuckDuckGo...")
        ddg = DuckDuckGoSearch()
        results['duckduckgo'] = ddg.search(query, max_results)
        time.sleep(0.5)  # Be nice to APIs
    
    if 'arxiv' in sources:
        print("🔍 Searching arXiv...")
        arxiv = ArxivSearch()
        results['arxiv'] = arxiv.search(query, max_results)
        time.sleep(0.5)
    
    if 'github' in sources:
        print("🔍 Searching GitHub...")
        token = None
        github = GitHubSearch(token=token)
        results['github'] = github.search(query, max_results)
        time.sleep(0.5)
    
    if 'wiki' in sources:
        print("🔍 Searching Wikipedia...")
        wiki = WikipediaSearch()
        results['wikipedia'] = wiki.search(query)
    
    return results

def print_results(results: Dict):
    """Pretty print search results"""
    
    if 'duckduckgo' in results:
        print("\n" + "="*60)
        print("🌐 DuckDuckGo Results")
        print("="*60)
        for i, r in enumerate(results['duckduckgo'][:5], 1):
            print(f"\n{i}. {r['title']}")
            print(f"   URL: {r['url']}")
            print(f"   {r['snippet'][:150]}...")
    
    if 'arxiv' in results and results['arxiv']:
        print("\n" + "="*60)
        print("📄 arXiv Papers")
        print("="*60)
        for i, p in enumerate(results['arxiv'][:5], 1):
            print(f"\n{i}. {p['title'][:80]}")
            print(f"   Authors: {', '.join(p['authors'][:3])}")
            print(f"   arXiv: {p['arxiv_id']}")
    
    if 'github' in results and results['github']:
        print("\n" + "="*60)
        print("💻 GitHub Repositories")
        print("="*60)
        for i, r in enumerate(results['github'][:5], 1):
            print(f"\n{i}. {r['name']} ⭐ {r['stars']}")
            print(f"   {r['description'][:100] if r['description'] else 'No description'}")
            print(f"   Lang: {r['language']} | URL: {r['url']}")
    
    if 'wikipedia' in results and results['wikipedia']:
        print("\n" + "="*60)
        print("📚 Wikipedia")
        print("="*60)
        w = results['wikipedia']
        print(f"\n{w['title']}")
        print(f"{w['extract'][:300]}...")
        print(f"Read more: {w['url']}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Open Web Search')
    parser.add_argument('query', help='Search query')
    parser.add_argument('--sources', default='ddg,arxiv,github', help='Comma-separated sources')
    parser.add_argument('--max-results', type=int, default=10, help='Max results per source')
    parser.add_argument('--output', help='Output JSON file')
    
    args = parser.parse_args()
    
    sources = [s.strip() for s in args.sources.split(',')]
    results = multi_search(args.query, sources=sources, max_results=args.max_results)
    
    print_results(results)
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n💾 Results saved to {args.output}")