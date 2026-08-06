#!/usr/bin/env python3
"""
Search arXiv for academic papers
Usage: python search_arxiv.py "your query" [--max-results 10]
"""

import sys
import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote
import argparse

def search_arxiv(query, max_results=10):
    """Search arXiv papers"""
    base_url = "http://export.arxiv.org/api/query"
    
    params = {
        'search_query': f'all:{query}',
        'start': 0,
        'max_results': max_results,
        'sortBy': 'submittedDate',
        'sortOrder': 'descending'
    }
    
    try:
        print(f"🔍 Searching arXiv for: {query}")
        response = requests.get(base_url, params=params, timeout=30)
        response.raise_for_status()
        
        root = ET.fromstring(response.content)
        
        ns = {
            'atom': 'http://www.w3.org/2005/Atom',
            'arxiv': 'http://arxiv.org/schemas/atom'
        }
        
        papers = []
        for entry in root.findall('atom:entry', ns):
            paper = {
                'title': entry.find('atom:title', ns).text.strip() if entry.find('atom:title', ns) is not None else '',
                'authors': [author.find('atom:name', ns).text for author in entry.findall('atom:author', ns)],
                'summary': entry.find('atom:summary', ns).text.strip() if entry.find('atom:summary', ns) is not None else '',
                'published': entry.find('atom:published', ns).text[:10] if entry.find('atom:published', ns) is not None else '',
                'arxiv_id': entry.find('atom:id', ns).text.split('/')[-1] if entry.find('atom:id', ns) is not None else '',
                'pdf_url': '',
                'primary_category': ''
            }
            
            # Get PDF link
            for link in entry.findall('atom:link', ns):
                if link.get('title') == 'pdf':
                    paper['pdf_url'] = link.get('href', '')
            
            # Get primary category
            cat = entry.find('arxiv:primary_category', ns)
            if cat is not None:
                paper['primary_category'] = cat.get('term', '')
            
            papers.append(paper)
        
        return papers
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def print_papers(papers):
    """Print papers in readable format"""
    if not papers:
        print("No results found.")
        return
    
    print(f"\n📄 Found {len(papers)} papers:\n")
    print("="*80)
    
    for i, paper in enumerate(papers, 1):
        print(f"\n{i}. {paper['title']}")
        print(f"   Authors: {', '.join(paper['authors'][:3])}{'...' if len(paper['authors']) > 3 else ''}")
        print(f"   Published: {paper['published']} | Category: {paper['primary_category']}")
        print(f"   arXiv ID: {paper['arxiv_id']}")
        if paper['pdf_url']:
            print(f"   PDF: {paper['pdf_url']}")
        print(f"\n   Abstract: {paper['summary'][:200]}...")
        print("-"*80)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Search arXiv papers')
    parser.add_argument('query', help='Search query')
    parser.add_argument('--max-results', type=int, default=10, help='Maximum number of results')
    
    args = parser.parse_args()
    
    papers = search_arxiv(args.query, args.max_results)
    print_papers(papers)